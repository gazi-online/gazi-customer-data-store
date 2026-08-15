import { AIProviderRegistry } from './src/lib/ai/providers';
import { PromptManager } from './src/lib/ai/prompts/PromptManager';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Setup environment
const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
  }
});
// deliberately break gemini key
process.env.GEMINI_API_KEY = "INVALID_KEY_FOR_TESTING";

async function simulateProductionExtraction() {
  const reqId = uuidv4().substring(0, 8);
  console.log(`\n\n--- STARTING PRODUCTION SIMULATION ---`);
  console.log(`[AI] extraction_start requestId=${reqId}`);
  
  const imagePath = path.join(process.cwd(), 'dummy-aadhaar.jpg');
  const fileBuffer = fs.readFileSync(imagePath);
  const base64Data = fileBuffer.toString('base64');
  const mimeType = 'image/jpeg';
  const fileDataArray = [{
    name: 'dummy-aadhaar.jpg',
    type: mimeType,
    mimeType: mimeType,
    size: fileBuffer.length,
    base64Data: base64Data
  }];

  const finalPrompt = PromptManager.generateFinalPrompt({
    provider: 'gemini' as any,
    version: 'v1' as any,
    documentTypes: ['AADHAAR_FRONT']
  });

  const providerName = 'gemini';
  const provider = AIProviderRegistry.getProvider(providerName);

  const primaryStart = Date.now();
  console.log(`[AI] gemini_start requestId=${reqId}`);
  let extractionResult = await provider.extractData(
    "You are a highly accurate Document Extraction AI.", 
    finalPrompt, 
    fileDataArray,
    { reqId } as any
  );
  console.log(`[AI] gemini_end requestId=${reqId} duration=${Date.now() - primaryStart}ms status=${extractionResult.status} category=${extractionResult.errorCategory}`);

  let fallbackTriggered = false;

  if (extractionResult.status === 'failed') {
    const fallbackEligibleCategories = [
      'AUTHENTICATION', 'RATE_LIMIT', 'QUOTA', 'MODEL_UNAVAILABLE', 'NETWORK', 'PROVIDER_ERROR', 'TIMEOUT'
    ];
    
    if (extractionResult.errorCategory && fallbackEligibleCategories.includes(extractionResult.errorCategory)) {
      console.warn(`[AI Fallback] Primary provider '${providerName}' failed (${extractionResult.errorCategory}). Falling back to 'openrouter'...`);
      try {
        fallbackTriggered = true;
        const fallbackStart = Date.now();
        console.log(`[AI] fallback_start requestId=${reqId}`);
        const fallbackProvider = AIProviderRegistry.getProvider('openrouter');
        extractionResult = await fallbackProvider.extractData(
          "You are a highly accurate Document Extraction AI.", 
          finalPrompt, 
          fileDataArray,
          { reqId, model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free' } as any
        );
        console.log(`[AI] fallback_end requestId=${reqId} duration=${Date.now() - fallbackStart}ms status=${extractionResult.status} category=${extractionResult.errorCategory}`);
      } catch (err: any) {
         console.error("[AI Fallback] Initialization of fallback provider failed:", err.message);
      }
    }
  }
  
  console.log(`[AI] extraction_end requestId=${reqId}`);
  console.log(`--- END PRODUCTION SIMULATION ---\n`);
}

simulateProductionExtraction();
