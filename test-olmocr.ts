import fs from 'fs';
import path from 'path';

/**
 * Isolated Proof of Concept (POC) for olmOCR using OpenAI-compatible API
 * 
 * Requirements:
 * - Uses OLMOCR_API_URL, OLMOCR_API_KEY, OLMOCR_MODEL environment variables
 * - Default model: allenai/olmOCR-2-7B-1025
 * - Sends text + base64 image using OpenAI-compatible chat/completions format
 * - Never prints or leaks API keys or secrets
 * - Works ONLY with non-sensitive test documents
 */

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

// Load environment variables from .env.local if present
loadEnv();

const olmOcrApiUrl = process.env.OLMOCR_API_URL;
const olmOcrApiKey = process.env.OLMOCR_API_KEY;
const olmOcrModel = process.env.OLMOCR_MODEL || 'allenai/olmOCR-2-7B-1025';

// Boolean configuration checks
const isUrlConfigured = Boolean(olmOcrApiUrl && olmOcrApiUrl.trim().length > 0);
const isKeyConfigured = Boolean(olmOcrApiKey && olmOcrApiKey.trim().length > 0);
const isModelConfigured = Boolean(process.env.OLMOCR_MODEL && process.env.OLMOCR_MODEL.trim().length > 0);

function sanitizeError(error: any): string {
  if (!error) return 'Unknown error';
  let message = typeof error === 'string' ? error : error.message || JSON.stringify(error);
  
  if (olmOcrApiKey) {
    message = message.replace(new RegExp(olmOcrApiKey, 'g'), '[REDACTED_API_KEY]');
  }
  message = message.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
  return message;
}

async function runOlmOcrPoc() {
  console.log('=== OLMOCR POC CONFIGURATION CHECK ===');
  console.log(`OLMOCR_API_URL configured: ${isUrlConfigured}`);
  console.log(`OLMOCR_API_KEY configured: ${isKeyConfigured}`);
  console.log(`OLMOCR_MODEL configured: ${isModelConfigured} (Model: ${olmOcrModel})`);
  console.log('=====================================\n');

  if (!isUrlConfigured) {
    console.log('HTTP Status: N/A');
    console.log('Processing Time: 0ms');
    console.log('Success: false (Skipped)');
    console.log('Sanitized Error: OLMOCR_API_URL is not configured in .env.local. POC is ready for configuration.');
    return;
  }

  // File path resolution (defaulting to local sample-test-doc.png)
  const argPath = process.argv[2];
  const testDocPath = argPath ? path.resolve(argPath) : path.join(process.cwd(), 'sample-test-doc.png');

  if (!fs.existsSync(testDocPath)) {
    console.log('HTTP Status: N/A');
    console.log('Processing Time: 0ms');
    console.log('Success: false');
    console.log('Sanitized Error:', sanitizeError(`Test document file not found at path: ${testDocPath}`));
    return;
  }

  // Security Policy Check: Prevent accidental processing of sensitive documents
  const fileNameLower = path.basename(testDocPath).toLowerCase();
  if (fileNameLower.includes('aadhaar') || fileNameLower.includes('customer') || fileNameLower.includes('passport')) {
    console.log('HTTP Status: N/A');
    console.log('Processing Time: 0ms');
    console.log('Success: false');
    console.log('Sanitized Error: Security Policy Violation - Sensitive document detected. Use non-sensitive test documents only.');
    return;
  }

  const startTime = Date.now();

  try {
    const fileBuffer = fs.readFileSync(testDocPath);
    const base64Data = fileBuffer.toString('base64');
    const ext = path.extname(testDocPath).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.webp') mimeType = 'image/webp';

    const baseUrl = olmOcrApiUrl!.replace(/\/$/, '');
    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isKeyConfigured) {
      headers['Authorization'] = `Bearer ${olmOcrApiKey}`;
    }

    const payload = {
      model: olmOcrModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Read all text from this document and output clean markdown text.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const processingTimeMs = Date.now() - startTime;
    const httpStatus = response.status;

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`HTTP Status: ${httpStatus}`);
      console.log(`Processing Time: ${processingTimeMs}ms`);
      console.log(`Success: false`);
      console.log(`Sanitized Error: ${sanitizeError(`API Error (${httpStatus}): ${errorText}`)}`);
      return;
    }

    const responseData: any = await response.json();
    const extractedContent = responseData?.choices?.[0]?.message?.content || 'No text extracted.';

    console.log(`HTTP Status: ${httpStatus}`);
    console.log(`Processing Time: ${processingTimeMs}ms`);
    console.log(`Success: true`);
    console.log(`Extracted OCR Markdown/Text:\n${extractedContent}`);

  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime;
    console.log(`HTTP Status: N/A`);
    console.log(`Processing Time: ${processingTimeMs}ms`);
    console.log(`Success: false`);
    console.log(`Sanitized Error: ${sanitizeError(error)}`);
  }
}

runOlmOcrPoc();
