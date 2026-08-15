import { OpenRouterProvider } from './src/lib/ai/providers/openrouter';
import { PromptManager } from './src/lib/ai/prompts/PromptManager';
import fs from 'fs';
import path from 'path';

// Setup environment
const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
let apiKey = '';
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
    if (match[1].trim() === 'OPENROUTER_API_KEY') {
      apiKey = match[2].trim();
    }
  }
});

async function getTopFreeVisionModels() {
  console.log("🔍 Fetching currently available free OpenRouter models...");
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const data = await res.json();
  const freeVision = data.data.filter((m: any) => {
    const isFree = (m.pricing?.prompt === "0" || m.pricing?.prompt === 0) && 
                   (m.pricing?.completion === "0" || m.pricing?.completion === 0) || 
                   m.id.endsWith(':free');
    const supportsVision = m.architecture?.modality && m.architecture.modality.includes('image');
    
    const isGeneral = !m.id.includes('safety') && !m.id.includes('moderation') && !m.id.includes('audio') && !m.id.includes('lyria'); // exclude safety and lyria which is audio
    
    return isFree && supportsVision && isGeneral;
  });
  
  // Pick up to 3 candidates
  const candidates = freeVision.slice(0, 3).map((m: any) => m.id);
  // Ensure we don't pick openrouter/free
  return candidates.filter((id: string) => id !== 'openrouter/free').slice(0, 3);
}

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

  const modelsToTest = await getTopFreeVisionModels();
  console.log("Models to test:", modelsToTest);
  
  const results = [];

  for (const model of modelsToTest) {
    console.log(`\n================================`);
    console.log(`🧪 Testing ${model}...`);
    
    let duration = 0;
    let jsonParseSuccess = false;
    let schemaValid = false;
    let nameExtracted = false;
    let relationshipExtracted = false;
    let addressExtracted = false;
    let districtExtracted = false;
    let countryExtracted = false;
    let photoExtracted = false;
    let overallSuccess = false;
    
    try {
      const startTime = Date.now();
      const result = await provider.extractData(
        systemInstruction,
        prompt,
        files,
        { model: model }
      );
      duration = Date.now() - startTime;

      if (result.status === 'success' && result.parsedJson) {
        jsonParseSuccess = true;
        
        const c = result.parsedJson.customer;
        const doc = result.parsedJson.documents?.[0];
        
        if (c && typeof c === 'object') {
          schemaValid = true;
          if (c.full_name) nameExtracted = true;
          if (c.father_name || c.spouse_name) relationshipExtracted = true;
          if (c.address && c.address.full_address) addressExtracted = true;
          if (c.address && c.address.district) districtExtracted = true;
          if (c.address && c.address.country) countryExtracted = true;
        }
        
        if (doc && doc.document_type === 'AADHAAR_FRONT') {
          if (doc.extracted_data?.profile_photo_available || doc.extracted_data?.profile_photo_bounding_box) {
            photoExtracted = true;
          }
        }

        if (schemaValid && nameExtracted && districtExtracted) {
          overallSuccess = true;
        }
      }

      results.push({
        Model: model,
        'HTTP status': result.status === 'success' ? 200 : result.errorCategory,
        Duration: `${duration}ms`,
        JSON: jsonParseSuccess ? 'PASS' : 'FAIL',
        Schema: schemaValid ? 'PASS' : 'FAIL',
        Name: nameExtracted ? 'PASS' : 'FAIL',
        Address: addressExtracted ? 'PASS' : 'FAIL',
        District: districtExtracted ? 'PASS' : 'FAIL',
        Country: countryExtracted ? 'PASS' : 'FAIL',
        Relationship: relationshipExtracted ? 'PASS' : 'FAIL',
        Photo: photoExtracted ? 'PASS' : 'FAIL',
        Overall: overallSuccess ? 'PASS' : 'FAIL',
      });
      
    } catch(e: any) {
      console.error("Test failed:", e.message);
      results.push({
        Model: model,
        'HTTP status': 'ERROR',
        Duration: 'N/A',
        JSON: 'FAIL',
        Schema: 'FAIL',
        Name: 'FAIL',
        Address: 'FAIL',
        District: 'FAIL',
        Country: 'FAIL',
        Relationship: 'FAIL',
        Photo: 'FAIL',
        Overall: 'FAIL',
      });
    }
  }

  console.log("\n================================ CANDIDATE RESULTS ================================\n");
  console.table(results);
}

runTest();
