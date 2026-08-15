"use server";

import { AIProviderRegistry } from "@/lib/ai/providers";
import { PromptManager } from "@/lib/ai/prompts/PromptManager";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

export async function extractDataFromDocuments(formData: FormData) {
  const perfTimings: Record<string, number> = {};
  const totalStart = Date.now();
  
  try {
    const supabase = await createClient();
    
    // 1. Validate auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // 2. Extract inputs from FormData
    const files = formData.getAll('files') as File[];
    const documentTypesRaw = formData.get('documentTypes') as string;
    const documentTypes = documentTypesRaw ? JSON.parse(documentTypesRaw) : [];
    
    if (files.length === 0) {
      throw new Error("No files provided for extraction");
    }

    // 3. File Validation (Size and Type)
    const fileDataArray = [];
    const originalImages = [];
    let approximateTotalImageSize = 0;
    
    const prepStart = Date.now();
    for (const file of files) {
      approximateTotalImageSize += file.size;
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error(`File ${file.name} exceeds 10MB limit`);
      }
      
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`File type ${file.type} is not supported. Use JPG, PNG, WEBP, or PDF.`);
      }

      // Convert File to Base64 for the AI Provider
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      
      fileDataArray.push({
        mimeType: file.type,
        base64Data: base64
      });

      // We only log file names in history for now, full upload happens separately for security
      originalImages.push(file.name); 
    }
    perfTimings.imagePreparation = Date.now() - prepStart;

    // 4. Generate the Prompt using PromptManager
    const providerName = process.env.DEFAULT_AI_PROVIDER || 'gemini';
    const promptVersion = process.env.PROMPT_VERSION || 'v1';
    
    const finalPrompt = PromptManager.generateFinalPrompt({
      provider: providerName as any,
      version: promptVersion as any,
      documentTypes: documentTypes
    });

    const reqId = uuidv4().substring(0, 8);
    console.log(`[AI] extraction_start requestId=${reqId}`);

    const TOTAL_AI_BUDGET_MS = 15000;
    const providerStartTime = Date.now();

    // 5. Get the AI Provider from Registry
    const provider = AIProviderRegistry.getProvider(providerName);

    // 6. Call AI Extraction (Primary attempt + capped retry)
    const primaryStart = Date.now();
    console.log(`[AI] gemini_start requestId=${reqId}`);
    let extractionResult = await provider.extractData(
      "You are a highly accurate Document Extraction AI.", 
      finalPrompt, 
      fileDataArray,
      { reqId } as any
    );
    
    const primaryAttemptMs = extractionResult.primaryAttemptMs || (Date.now() - primaryStart);
    const retryAttemptMs = extractionResult.retryAttemptMs || 0;
    perfTimings.primaryAttemptDuration = Date.now() - primaryStart;
    
    console.log(`[AI] gemini_end requestId=${reqId} primary_attempt_ms=${primaryAttemptMs} retry_attempt_ms=${retryAttemptMs} duration=${perfTimings.primaryAttemptDuration}ms status=${extractionResult.status} category=${extractionResult.errorCategory}`);

    let finalProviderName = providerName;
    let fallbackTriggered = false;
    let primaryStatus = extractionResult.status;
    let primaryErrorCategory = extractionResult.errorCategory || 'UNKNOWN';
    perfTimings.fallbackAttemptDuration = 0;

    // 6.1 Fallback Architecture with budget check
    const qualifyingFallbackErrors = [
      'AUTHENTICATION',
      'RATE_LIMIT',
      'QUOTA',
      'MODEL_UNAVAILABLE',
      'NETWORK',
      'PROVIDER_ERROR',
      'TIMEOUT'
    ];

    const elapsedSoFar = Date.now() - providerStartTime;
    const remainingBudgetMs = TOTAL_AI_BUDGET_MS - elapsedSoFar;

    if (extractionResult.status === 'failed') {
      if (remainingBudgetMs <= 2000) {
        console.warn(`[AI Extraction] Primary provider failed and remaining budget (${remainingBudgetMs}ms) is too low for fallback. Returning timeout.`);
        extractionResult.errorCategory = 'TIMEOUT';
        extractionResult.errorMessage = 'AI extraction total budget exceeded (15000ms cap).';
      } else if (primaryErrorCategory && qualifyingFallbackErrors.includes(primaryErrorCategory)) {
        console.warn(`[AI Extraction] Primary provider '${providerName}' failed (${extractionResult.errorCategory}). Triggering OpenRouter fallback (Budget remaining: ${remainingBudgetMs}ms).`);
        
        fallbackTriggered = true;
        const fallbackStart = Date.now();
        const fallbackProvider = AIProviderRegistry.getProvider('openrouter');
        
        extractionResult = await fallbackProvider.extractData(
          "You are a highly accurate Document Extraction AI.", 
          finalPrompt, 
          fileDataArray,
          { reqId: reqId + '-fb', timeoutMs: Math.min(8000, remainingBudgetMs) } as any
        );
        
        perfTimings.fallbackAttemptDuration = Date.now() - fallbackStart;
        finalProviderName = fallbackProvider.getName();
        console.log(`[AI] fallback_end requestId=${reqId} fallback_attempt_ms=${perfTimings.fallbackAttemptDuration}ms status=${extractionResult.status}`);
      } else {
        console.warn(`[AI Extraction] Primary provider '${providerName}' failed (${extractionResult.errorCategory}). Category does not qualify for fallback.`);
      }
    }

    const totalProviderMs = Date.now() - providerStartTime;
    console.log(`[AI] provider_pipeline_summary primary_attempt_ms=${primaryAttemptMs} retry_attempt_ms=${retryAttemptMs} fallback_attempt_ms=${perfTimings.fallbackAttemptDuration} total_provider_ms=${totalProviderMs} final_provider=${finalProviderName}`);

    // 6.5 Extract Profile Photo if available
    const normStart = Date.now();
    let photoProcessingTime = 0;

    if (extractionResult.status === 'success' && extractionResult.parsedJson?.profile_photo?.available && Array.isArray(extractionResult.parsedJson.profile_photo.bounding_box)) {
      const photoStart = Date.now();
      const box = extractionResult.parsedJson.profile_photo.bounding_box;
      const targetFile = fileDataArray[0];
      
      if (targetFile && box.length === 4) {
        try {
          const [ymin, xmin, ymax, xmax] = box;
          const imageBuffer = Buffer.from(targetFile.base64Data, 'base64');
          
          // Re-use single sharp pipeline instance for metadata and extract
          const sharpImg = sharp(imageBuffer);
          const metadata = await sharpImg.metadata();
          
          if (metadata.width && metadata.height) {
            let x = xmin;
            let y = ymin;
            let w = xmax - xmin;
            let h = ymax - ymin;
            
            if (xmax <= 1000 && ymax <= 1000) {
              const scale = (xmax <= 1 && ymax <= 1 && xmax > 0) ? 1 : 1000;
              x = (xmin / scale) * metadata.width;
              y = (ymin / scale) * metadata.height;
              w = ((xmax - xmin) / scale) * metadata.width;
              h = ((ymax - ymin) / scale) * metadata.height;
            }
            
            x = Math.floor(x);
            y = Math.floor(y);
            w = Math.floor(w);
            h = Math.floor(h);
            
            if (ymin < ymax && xmin < xmax && x >= 0 && y >= 0 && w > 20 && h > 20 && x < metadata.width && y < metadata.height) {
              if (x + w > metadata.width) w = metadata.width - x;
              if (y + h > metadata.height) h = metadata.height - y;

              // Optimized JPEG encoding quality 80 for smaller upload payload & faster processing
              const croppedBuffer = await sharp(imageBuffer)
                .extract({ left: x, top: y, width: w, height: h })
                .jpeg({ quality: 80, mozjpeg: false })
                .toBuffer();
                
              const fileName = `${user.id}/${uuidv4()}.jpg`;
              
              const { error: uploadError } = await supabase.storage
                .from('customer-profiles')
                .upload(fileName, croppedBuffer, {
                  contentType: 'image/jpeg',
                  cacheControl: '3600',
                  upsert: false
                });
                
              if (!uploadError) {
                extractionResult.parsedJson.profile_photo.storage_path = fileName;
              } else {
                console.error("[profile_photo] Storage upload error:", uploadError);
                extractionResult.parsedJson.profile_photo.available = false;
              }
            } else {
              console.warn("[profile_photo] Invalid bounding box coordinates:", box, "Image:", metadata.width, metadata.height);
              extractionResult.parsedJson.profile_photo.available = false;
            }
          }
        } catch (cropError) {
          console.error("[profile_photo] Crop error:", cropError);
          extractionResult.parsedJson.profile_photo.available = false;
        }
      } else {
        extractionResult.parsedJson.profile_photo.available = false;
      }
      photoProcessingTime = Date.now() - photoStart;
    }
    
    perfTimings.normalizationAndMerge = Date.now() - normStart - photoProcessingTime;

    // 7. Save to AI Import History
    const dbLogStart = Date.now();
    const { data: historyData, error: dbError } = await supabase
      .from('ai_import_history')
      .insert([{
        created_by: user.id,
        original_images: JSON.stringify(originalImages),
        ai_raw_response: "[REDACTED FOR PRIVACY]",
        final_json: extractionResult.parsedJson || null,
        ai_provider: finalProviderName,
        prompt_version: promptVersion,
        status: extractionResult.status,
        processing_time_ms: extractionResult.processingTimeMs,
        input_tokens: extractionResult.inputTokens || 0,
        output_tokens: extractionResult.outputTokens || 0,
        estimated_cost: extractionResult.estimatedCost || 0,
        model_name: extractionResult.modelName,
        error_message: extractionResult.errorMessage || null
      }])
      .select('id')
      .single();

    if (dbError) {
      console.error("[extractDataFromDocuments] Error saving history:", dbError.message);
    }
    perfTimings.databaseLogging = Date.now() - dbLogStart;

    const totalEnd = Date.now();
    perfTimings.totalTime = totalEnd - totalStart;

    console.log(`[AI] extraction_end requestId=${reqId} duration=${perfTimings.totalTime}ms`);

    // Performance Report
    console.log("=========================================");
    console.log("   AI EXTRACTION PERFORMANCE REPORT      ");
    console.log("=========================================");
    console.log(`Document Count:  ${files.length}`);
    console.log(`Approx Size:     ${(approximateTotalImageSize / 1024).toFixed(2)} KB`);
    console.log("-----------------------------------------");
    console.log(`Primary Provider: gemini`);
    console.log(`Primary Attempt:  ${primaryStatus === 'failed' ? 'FAILED' : 'SUCCESS'}`);
    console.log(`Primary Duration: ${perfTimings.primaryAttemptDuration} ms`);
    if (primaryStatus === 'failed') {
      console.log(`Failure Category: ${primaryErrorCategory}`);
    }
    
    if (fallbackTriggered) {
      console.log("-----------------------------------------");
      console.log(`Fallback Provider: openrouter`);
      console.log(`Fallback Duration: ${perfTimings.fallbackAttemptDuration} ms`);
    }

    console.log("-----------------------------------------");
    console.log(`Other Processing:`);
    console.log(`Image Prep:      ${perfTimings.imagePreparation} ms`);
    console.log(`Data Normalization: ${perfTimings.normalizationAndMerge} ms`);
    console.log(`Photo Upload:    ${photoProcessingTime} ms`);
    console.log(`DB Logging:      ${perfTimings.databaseLogging} ms`);
    console.log("-----------------------------------------");
    console.log(`Total Pipeline:  ${perfTimings.totalTime} ms`);
    console.log("=========================================");

    // 8. Return result to frontend
    if (extractionResult.status === 'failed') {
      // Do not expose provider/model/API errors to the UI
      throw new Error("AI service is temporarily unavailable. Please try again.");
    }

    return { 
      success: true, 
      data: extractionResult.parsedJson,
      historyId: historyData?.id,
      perfSummary: {
        provider: finalProviderName,
        model: extractionResult.modelName,
        documentCount: files.length,
        imagePrepTime: perfTimings.imagePreparation,
        primaryAttemptDuration: perfTimings.primaryAttemptDuration,
        fallbackAttemptDuration: perfTimings.fallbackAttemptDuration,
        apiTime: extractionResult.apiCallTimeMs || 0,
        jsonParseTime: extractionResult.jsonParseTimeMs || 0,
        normalizationTime: perfTimings.normalizationAndMerge,
        dbLogTime: perfTimings.databaseLogging,
        totalTime: perfTimings.totalTime
      }
    };

  } catch (error: any) {
    console.error("[extractDataFromDocuments] Error:", error);
    return { success: false, error: error.message };
  }
}

export async function testGeminiConnection() {
  try {
    const provider = AIProviderRegistry.getProvider('gemini');
    
    // We send a minimal prompt to Gemini
    const result = await provider.extractData(
      "You are a helpful assistant.",
      "Reply with exactly: GCDS_GEMINI_OK",
      [] // No files
    );

    if (result.status === 'failed') {
      return { success: false, error: result.errorMessage || "Failed to connect to Gemini." };
    }

    // Check if the response contains our expected string
    if (result.rawResponse.includes("GCDS_GEMINI_OK")) {
      return { success: true, message: "Gemini Connected" };
    } else {
      return { success: false, error: "Connected to Gemini, but received unexpected response." };
    }
  } catch (error: any) {
    console.error("[testGeminiConnection] Error:", error);
    return { success: false, error: "Failed to connect to Gemini API: " + error.message };
  }
}

export async function getProfilePhotoSignedUrl(path: string | null) {
  if (!path) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from('customer-profiles').createSignedUrl(path, 3600); // 1 hour
    if (error) {
      console.error("[getProfilePhotoSignedUrl] Error:", error.message);
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    console.error("[getProfilePhotoSignedUrl] Error:", error);
    return null;
  }
}
