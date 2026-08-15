import { AIProviderRegistry } from './src/lib/ai/providers/registry';
import { PromptManager } from './src/lib/ai/prompts/PromptManager';
import fs from 'fs';
import path from 'path';

// Override env vars
const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
});

process.env.GEMINI_API_KEY = "invalid-key"; // FORCE FAILURE

async function run() {
  const imagePath = path.join(process.cwd(), 'dummy-aadhaar.jpg');
  const fileBuffer = fs.readFileSync(imagePath);
  const base64Data = fileBuffer.toString('base64');
  
  const finalPrompt = PromptManager.generateFinalPrompt({
      provider: 'gemini',
      version: 'v1',
      documentTypes: ['Aadhaar Card']
  });

  const fileDataArray = [{
      mimeType: 'image/jpeg',
      base64Data: base64Data
  }];

  const reqId = "testreq123";
  console.log(`[AI] extraction_start requestId=${reqId}`);

  const provider = AIProviderRegistry.getProvider('gemini');
  let extractionResult = await provider.extractData(
      "You are a highly accurate Document Extraction AI.", 
      finalPrompt, 
      fileDataArray,
      { reqId } as any
  );

  let primaryErrorCategory = extractionResult.errorCategory || 'UNKNOWN';

  const qualifyingFallbackErrors = [
      'AUTHENTICATION', 'RATE_LIMIT', 'QUOTA', 'MODEL_UNAVAILABLE', 'NETWORK', 'PROVIDER_ERROR', 'TIMEOUT'
  ];

  if (extractionResult.status === 'failed') {
      console.log(`[TEST] Gemini failed with ${primaryErrorCategory}`);
      if (qualifyingFallbackErrors.includes(primaryErrorCategory)) {
          console.log(`[TEST] Triggering OpenRouter fallback.`);
          const fallbackProvider = AIProviderRegistry.getProvider('openrouter');
          extractionResult = await fallbackProvider.extractData(
              "You are a highly accurate Document Extraction AI.", 
              finalPrompt, 
              fileDataArray,
              { reqId: reqId + '-fb' } as any
          );
      }
  }

  console.log("[TEST] FINAL RESULT:", extractionResult.status, extractionResult.errorCategory, extractionResult.errorMessage);
}

run();
