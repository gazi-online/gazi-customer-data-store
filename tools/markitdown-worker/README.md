# GCDS MarkItDown Isolated Preprocessing Worker

This directory contains the isolated, optional Python-based preprocessing worker for text-capable customer documents (PDF, DOCX, XLSX).

## Architecture & Security Boundary

1. **Decoupled Execution**:
   - Next.js does not link against or directly embed Python.
   - The worker runs as an isolated subprocess invoking `tools/markitdown-worker/worker.py` via the local `.venv`.
   - Communication is strictly over standard input/output with structured JSON.
   
2. **Security & Input Validation**:
   - Only `.pdf`, `.docx`, and `.xlsx` formats are accepted.
   - User-supplied file paths and remote URLs are strictly rejected.
   - Input payloads are capped at 10 MB.
   - Converted Markdown output is capped at 500 KB to avoid prompt injection bloat and memory exhaustion.
   - Temporary files are created only when stream converters require seeking, strictly utilizing random names in the system temp directory, and are cleaned up in `finally` blocks.
   - Error messages are deterministic error codes (e.g. `UNSUPPORTED_FORMAT`, `CONVERSION_FAILED`); no stack traces, paths, or secrets are ever emitted.
   - PII and document content are never permanently stored or logged.

3. **Dependency Policy**:
   - The worker uses a project-local virtual environment (`tools/markitdown-worker/.venv`).
   - Pinned dependencies are defined in `requirements.txt`.
   - OCR plugins (`markitdown-ocr`) are intentionally excluded to prevent double-OCR and unnecessary overhead.

## Setup (Local Development)

The environment is managed via `uv`:
```bash
uv venv tools/markitdown-worker/.venv
uv pip install --python tools/markitdown-worker/.venv -r tools/markitdown-worker/requirements.txt
```

Verify health:
```bash
tools/markitdown-worker/.venv/Scripts/python tools/markitdown-worker/worker.py --health
```

## Production Deployment Path

In local development and on-premises environments, the adapter invokes this worker script.
For serverless / containerized deployments (such as Vercel + backend service):
- Deploy this directory as an internal microservice or container task (e.g., AWS Lambda container / Cloud Run).
- Configure `MARKITDOWN_SERVICE_URL` in Next.js environment.
- The `MarkItDownProvider` TypeScript abstraction cleanly switches to the remote HTTP endpoint without modifying any calling code in `ai-actions.ts` or `AiSmartImportEngine`.
