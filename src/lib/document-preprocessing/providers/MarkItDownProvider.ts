import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { DocumentPreprocessor, PreprocessResult, PreprocessFailureCategory } from '../types';

class AsyncSemaphore {
  private active = 0;
  private peak = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      if (this.active > this.peak) this.peak = this.active;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    if (this.active > this.peak) this.peak = this.active;
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  getActiveCount(): number {
    return this.active;
  }

  getPeakCount(): number {
    return this.peak;
  }

  resetPeak(): void {
    this.peak = this.active;
  }
}

export class MarkItDownProvider implements DocumentPreprocessor {
  private static readonly TIMEOUT_MS = 10000; // 10s budget
  private static readonly MAX_OUTPUT_BYTES = 500 * 1024; // 500 KB limit
  private static readonly MAX_CONCURRENT_WORKERS = 2; // Tightly bounded concurrency
  private static readonly semaphore = new AsyncSemaphore(MarkItDownProvider.MAX_CONCURRENT_WORKERS);

  /**
   * Diagnostic method to inspect active and peak worker concurrency.
   */
  public static getActiveWorkerCount(): number {
    return this.semaphore.getActiveCount();
  }

  public static getPeakWorkerCount(): number {
    return this.semaphore.getPeakCount();
  }

  public static resetPeakWorkerCount(): void {
    this.semaphore.resetPeak();
  }

  /**
   * Locates the isolated project-local worker Python executable.
   */
  private getWorkerPythonPath(): string | null {
    const cwd = process.cwd();
    const isWindows = process.platform === 'win32';
    const relativeVenv = isWindows
      ? path.join('tools', 'markitdown-worker', '.venv', 'Scripts', 'python.exe')
      : path.join('tools', 'markitdown-worker', '.venv', 'bin', 'python');

    const fullPath = path.resolve(cwd, relativeVenv);
    return fs.existsSync(fullPath) ? fullPath : null;
  }

  /**
   * Locates the worker script.
   */
  private getWorkerScriptPath(): string | null {
    const cwd = process.cwd();
    const fullPath = path.resolve(cwd, 'tools', 'markitdown-worker', 'worker.py');
    return fs.existsSync(fullPath) ? fullPath : null;
  }

  /**
   * Checks if MarkItDown worker is available and enabled.
   */
  public isAvailable(): boolean {
    if (process.env.DISABLE_MARKITDOWN === 'true' || process.env.MARKITDOWN_PREPROCESSING_ENABLED === 'false') {
      return false;
    }
    const pythonPath = this.getWorkerPythonPath();
    const scriptPath = this.getWorkerScriptPath();
    return Boolean(pythonPath && scriptPath);
  }

  /**
   * Preprocesses a text-capable document buffer via the isolated Python worker.
   */
  public async preprocess(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<PreprocessResult> {
    const startTime = performance.now();
    const ext = path.extname(fileName).toLowerCase();

    // 1. Availability check
    if (!this.isAvailable()) {
      return {
        source: 'none',
        mimeType,
        fallbackRequired: true,
        warnings: ['MarkItDown worker is not available or disabled.'],
        error: 'WORKER_UNAVAILABLE',
        failureCategory: 'WORKER_UNAVAILABLE'
      };
    }

    const pythonPath = this.getWorkerPythonPath()!;
    const scriptPath = this.getWorkerScriptPath()!;

    // 2. Input validation
    const allowedExtensions = ['.pdf', '.docx', '.xlsx'];
    if (!allowedExtensions.includes(ext)) {
      return {
        source: 'none',
        mimeType,
        fallbackRequired: false,
        warnings: [`Unsupported extension: ${ext}`],
        error: 'UNSUPPORTED_FORMAT',
        failureCategory: 'UNSUPPORTED_EXTENSION'
      };
    }

    if (fileBuffer.length > 10 * 1024 * 1024) {
      return {
        source: 'none',
        mimeType,
        fallbackRequired: false,
        warnings: ['File exceeds maximum 10MB limit'],
        error: 'PAYLOAD_TOO_LARGE',
        failureCategory: 'PAYLOAD_TOO_LARGE'
      };
    }

    // 3. Acquire concurrency slot
    await MarkItDownProvider.semaphore.acquire();

    try {
      return await new Promise<PreprocessResult>((resolve) => {
        let isSettled = false;
        let stdoutData = '';

        const child = spawn(pythonPath, [scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        });

        const timer = setTimeout(() => {
          if (!isSettled) {
            isSettled = true;
            try {
              child.kill('SIGKILL');
            } catch {}
            resolve({
              source: 'none',
              mimeType,
              fallbackRequired: true,
              warnings: ['MarkItDown worker timed out after 10000ms'],
              error: 'TIMEOUT',
              failureCategory: 'TIMEOUT'
            });
          }
        }, MarkItDownProvider.TIMEOUT_MS);

        child.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString();
          // Prevent buffer explosion
          if (stdoutData.length > 2 * MarkItDownProvider.MAX_OUTPUT_BYTES) {
            try {
              child.kill();
            } catch {}
          }
        });

        child.on('error', () => {
          clearTimeout(timer);
          if (!isSettled) {
            isSettled = true;
            resolve({
              source: 'none',
              mimeType,
              fallbackRequired: true,
              warnings: ['Failed to spawn MarkItDown worker'],
              error: 'SPAWN_ERROR',
              failureCategory: 'WORKER_UNAVAILABLE'
            });
          }
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          if (isSettled) return;
          isSettled = true;

          const durationMs = performance.now() - startTime;

          if (code !== 0 || !stdoutData.trim()) {
            resolve({
              source: 'none',
              mimeType,
              fallbackRequired: true,
              warnings: [`Worker process exited with code ${code}`],
              error: 'CONVERSION_FAILED',
              failureCategory: 'CONVERSION_FAILED'
            });
            return;
          }

          try {
            const parsed = JSON.parse(stdoutData.trim());
            if (!parsed.ok) {
              const errCode = parsed.error_code || 'CONVERSION_FAILED';
              let failureCat: PreprocessFailureCategory = 'CONVERSION_FAILED';

              if (errCode === 'UNSUPPORTED_FORMAT') failureCat = 'UNSUPPORTED_EXTENSION';
              else if (errCode === 'PAYLOAD_TOO_LARGE') failureCat = 'PAYLOAD_TOO_LARGE';
              else if (errCode === 'OUTPUT_TOO_LARGE') failureCat = 'OUTPUT_TOO_LARGE';
              else if (errCode === 'INVALID_INPUT' || errCode === 'INVALID_BASE64') failureCat = 'PROTOCOL_VIOLATION';
              else if (errCode === 'WORKER_UNAVAILABLE') failureCat = 'WORKER_UNAVAILABLE';

              resolve({
                source: 'none',
                mimeType,
                fallbackRequired: failureCat === 'CONVERSION_FAILED' || failureCat === 'WORKER_UNAVAILABLE',
                warnings: [`Worker returned error: ${errCode}`],
                error: errCode,
                failureCategory: failureCat
              });
              return;
            }

            const rawMarkdown = parsed.markdown || '';
            const markdown = rawMarkdown.length > MarkItDownProvider.MAX_OUTPUT_BYTES
              ? rawMarkdown.slice(0, MarkItDownProvider.MAX_OUTPUT_BYTES)
              : rawMarkdown;

            resolve({
              source: 'markitdown',
              mimeType,
              markdown,
              fallbackRequired: false,
              warnings: parsed.truncated ? ['Markdown output was truncated to 500KB limit'] : [],
              metadata: {
                preprocessor: 'markitdown',
                format: parsed.format || ext.replace('.', ''),
                markdown_length: markdown.length,
                fallback_used: false,
                duration_ms: parsed.duration_ms || durationMs
              }
            });
          } catch {
            resolve({
              source: 'none',
              mimeType,
              fallbackRequired: false,
              warnings: ['Malformed JSON received from worker'],
              error: 'MALFORMED_WORKER_RESPONSE',
              failureCategory: 'MALFORMED_WORKER_PROTOCOL'
            });
          }
        });

        // Write payload to stdin securely
        try {
          const payload = JSON.stringify({
            file_base64: fileBuffer.toString('base64'),
            file_extension: ext,
            mime_type: mimeType,
            max_markdown_bytes: MarkItDownProvider.MAX_OUTPUT_BYTES
          });
          child.stdin.write(payload);
          child.stdin.end();
        } catch {
          clearTimeout(timer);
          if (!isSettled) {
            isSettled = true;
            try {
              child.kill();
            } catch {}
            resolve({
              source: 'none',
              mimeType,
              fallbackRequired: true,
              warnings: ['Failed to send input to worker stdin'],
              error: 'STDIN_WRITE_ERROR',
              failureCategory: 'PROTOCOL_VIOLATION'
            });
          }
        }
      });
    } finally {
      MarkItDownProvider.semaphore.release();
    }
  }
}
