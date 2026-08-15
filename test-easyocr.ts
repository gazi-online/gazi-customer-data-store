import fs from 'fs';
import path from 'path';

/**
 * Isolated Proof of Concept (POC) for EasyOCR API
 * 
 * Requirements:
 * - Uses EASY_OCR_API_KEY environment variable via X-Access-Key header
 * - Endpoint: https://console.easyocr.org/api/ocr
 * - Sends ONE local NON-SENSITIVE test image using multipart/form-data (field name: file)
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

loadEnv();

const easyOcrApiKey = process.env.EASY_OCR_API_KEY;
const isKeyConfigured = Boolean(easyOcrApiKey && easyOcrApiKey.trim().length > 0);

function sanitizeError(error: any): string {
  if (!error) return 'Unknown error';
  let message = typeof error === 'string' ? error : error.message || JSON.stringify(error);
  if (easyOcrApiKey) {
    message = message.replace(new RegExp(easyOcrApiKey, 'g'), '[REDACTED_API_KEY]');
  }
  message = message.replace(/X-Access-Key:[^\s\n]+/gi, 'X-Access-Key: [REDACTED]');
  return message;
}

async function runEasyOcrPoc() {
  console.log('=== EASYOCR POC CONFIGURATION CHECK ===');
  console.log(`EASY_OCR_API_KEY configured: ${isKeyConfigured}`);
  console.log('=======================================\n');

  if (!isKeyConfigured) {
    console.log('HTTP Status: N/A');
    console.log('Processing Time: 0ms');
    console.log('Success: false (Skipped)');
    console.log('Sanitized Error: EASY_OCR_API_KEY is not configured in .env.local.');
    return;
  }

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
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    
    const formData = new FormData();
    formData.append('file', blob, path.basename(testDocPath));

    const response = await fetch('https://console.easyocr.org/api/ocr', {
      method: 'POST',
      headers: {
        'X-Access-Key': easyOcrApiKey!,
      },
      body: formData,
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
    
    console.log(`HTTP Status: ${httpStatus}`);
    console.log(`Processing Time: ${processingTimeMs}ms`);
    console.log(`Success: true`);
    console.log(`Recognized Text / Response Data:\n${JSON.stringify(responseData, null, 2)}`);

  } catch (error: any) {
    const processingTimeMs = Date.now() - startTime;
    console.log(`HTTP Status: N/A`);
    console.log(`Processing Time: ${processingTimeMs}ms`);
    console.log(`Success: false`);
    console.log(`Sanitized Error: ${sanitizeError(error)}`);
  }
}

runEasyOcrPoc();
