import { OpenRouterProvider } from './src/lib/ai/providers/openrouter';
import { PromptManager } from './src/lib/ai/prompts/PromptManager';
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

async function runTest() {
  const provider = new OpenRouterProvider();
  
  const imagePath = path.join(process.cwd(), 'dummy-aadhaar.jpg');
  const fileBuffer = fs.readFileSync(imagePath);
  const base64Data = fileBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
  
  const systemInstruction = "You are a highly accurate Document Extraction AI.";
  const prompt = PromptManager.generateFinalPrompt({
    provider: 'openrouter' as any,
    version: 'v1' as any,
    documentTypes: ['AADHAAR_FRONT']
  });

  const files = [{
    name: 'dummy-aadhaar.jpg',
    type: mimeType,
    mimeType: mimeType,
    size: fileBuffer.length,
    base64Data: base64Data
  }];

  console.log("Starting OpenRouter extraction test...");
  
  try {
    const result = await provider.extractData(
      systemInstruction,
      prompt,
      files,
      { model: 'openrouter/free' }
    );
    console.log("Result status:", result.status);
    console.log("Result errorMessage:", result.errorMessage);
    console.log("Result errorCategory:", result.errorCategory);
  } catch(e: any) {
    console.error("Test script failed:", e.message);
  }
}

runTest();
