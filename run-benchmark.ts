import { JSONValidator } from './src/lib/ai/parser/validator';
import { PromptManager } from './src/lib/ai/prompts/PromptManager';
import fs from 'fs';
import path from 'path';

const imagePath = process.argv[2] || path.join(process.cwd(), 'dummy-aadhaar.jpg');
if (!fs.existsSync(imagePath)) {
  console.error(`❌ Please provide a path to an Aadhaar image or place 'dummy-aadhaar.jpg' in the project root.`);
  console.error(`Usage: npx tsx run-benchmark.ts [path/to/image.jpg]`);
  process.exit(1);
}

const fileBuffer = fs.readFileSync(imagePath);
const base64Data = fileBuffer.toString('base64');
const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

const systemInstruction = "You are a highly accurate Document Extraction AI.";
const prompt = PromptManager.generateFinalPrompt({
  provider: 'openrouter' as any,
  version: 'v1' as any,
  documentTypes: ['AADHAAR_FRONT']
});

async function getTopFreeVisionModels(apiKey: string) {
  console.log("🔍 Fetching currently available free OpenRouter models...");
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const data = await res.json();
  const freeVision = data.data.filter((m: any) => {
    const isFree = (m.pricing?.prompt === "0" || m.pricing?.prompt === 0) && 
                   (m.pricing?.completion === "0" || m.pricing?.completion === 0) || 
                   m.id.endsWith(':free');
    const supportsVision = m.architecture?.modality && m.architecture.modality.includes('image');
    return isFree && supportsVision;
  });
  
  // We want to test a good number of models, maybe up to 10
  return freeVision.slice(0, 10).map((m: any) => m.id);
}

async function runBenchmark() {
  const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
  let apiKey = '';
  const match = envContent.match(/OPENROUTER_API_KEY=(.+)/);
  if (match) {
    apiKey = match[1].trim();
  } else {
    console.error("No OPENROUTER_API_KEY found in .env.local");
    process.exit(1);
  }

  const modelsToTest = await getTopFreeVisionModels(apiKey);
  console.log("Models to benchmark:", modelsToTest);
  
  const results = [];
  const modelClassification: { model: string, decision: string, reason: string }[] = [];

  for (const model of modelsToTest) {
    console.log(`\n================================`);
    console.log(`🧪 Testing ${model}...`);
    
    const requestBody = {
      model: model,
      messages: [
        { role: "system", content: systemInstruction },
        { 
          role: "user", 
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ]
        }
      ],
      temperature: 0.0,
    };

    const apiStartTime = Date.now();
    let status = 0;
    
    let jsonParseSuccess = false;
    let schemaValid = false;
    let nameExtracted = false;
    let relationshipExtracted = false;
    let addressExtracted = false;
    let districtExtracted = false;
    let countryExtracted = false;
    let photoExtracted = false;
    let overallSuccess = false;
    
    let errorMsg = '';
    
    const controller = new AbortController();
    let response;
    let data;

    try {
      const fetchPromise = async () => {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "X-Title": "Benchmark Test"
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        const bodyData = await res.json();
        return { res, bodyData };
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          controller.abort();
          const err = new Error("AbortError: TIMEOUT");
          err.name = "AbortError";
          reject(err);
        }, 15000); // 15 seconds hard limit per model
      });

      const result: any = await Promise.race([fetchPromise(), timeoutPromise]);
      response = result.res;
      data = result.bodyData;
      status = response.status;
      
      const duration = Date.now() - apiStartTime;
      const durationStr = `${duration}ms`;

      if (!response.ok) {
        errorMsg = data.error?.message || `HTTP ${status}`;
      } else {
        const rawText = data.choices?.[0]?.message?.content || "{}";
        
        try {
          const parsed = JSONValidator.cleanAndParse(rawText);
          if (parsed && typeof parsed === 'object') {
            jsonParseSuccess = true;
            
            // Check schema and fields safely without logging PII
            const c = parsed.customer;
            const doc = parsed.documents?.[0];
            
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

            // Let's decide overall success
            if (schemaValid && nameExtracted && districtExtracted) {
              overallSuccess = true;
            } else {
               if (!nameExtracted) errorMsg = "Missing name";
               else if (!districtExtracted) errorMsg = "Missing district";
            }
          }
        } catch (e) {
          errorMsg = "JSON Parse Failed";
        }
      }
      
      results.push({
        Model: model,
        Duration: durationStr,
        JSON: jsonParseSuccess ? 'PASS' : 'FAIL',
        Schema: schemaValid ? 'PASS' : 'FAIL',
        Name: nameExtracted ? 'PASS' : 'FAIL',
        Relationship: relationshipExtracted ? 'PASS' : 'FAIL',
        Address: addressExtracted ? 'PASS' : 'FAIL',
        District: districtExtracted ? 'PASS' : 'FAIL',
        Country: countryExtracted ? 'PASS' : 'FAIL',
        Photo: photoExtracted ? 'PASS' : 'FAIL',
        Overall: overallSuccess ? 'PASS' : 'FAIL',
      });
      
      let decision = 'REJECT';
      let reason = 'Failed criteria';
      
      if (overallSuccess && duration <= 15000) {
        decision = 'KEEP';
        reason = 'Fast, valid JSON, schema pass, core fields extracted';
      } else if (duration > 15000) {
        reason = 'Timeout';
      } else if (!jsonParseSuccess) {
        reason = 'Invalid JSON';
      } else if (!schemaValid) {
        reason = 'Schema mismatch';
      } else if (!nameExtracted) {
        reason = 'Missing full_name';
      }
      
      modelClassification.push({ model, decision, reason });
      
    } catch (e: any) {
      const duration = Date.now() - apiStartTime;
      let reason = e.message;
      if (e.name === 'AbortError' || e.message?.includes('TIMEOUT')) {
        reason = 'TIMEOUT (15s)';
      }
      
      results.push({
        Model: model,
        Duration: `${duration}ms`,
        JSON: 'FAIL',
        Schema: 'FAIL',
        Name: 'FAIL',
        Relationship: 'FAIL',
        Address: 'FAIL',
        District: 'FAIL',
        Country: 'FAIL',
        Photo: 'FAIL',
        Overall: 'FAIL'
      });
      
      modelClassification.push({ model, decision: 'REJECT', reason });
    }
  }

  console.log("\n================================ BENCHMARK RESULTS ================================\n");
  console.table(results);
  
  console.log("\n================================ MODEL CLASSIFICATION ================================\n");
  modelClassification.forEach(m => {
    console.log(`[${m.decision}] ${m.model} - ${m.reason}`);
  });
}

runBenchmark();
