"use server";

import { after } from "next/server";
import { AIProviderRegistry } from "@/lib/ai/providers";
import { PromptManager } from "@/lib/ai/prompts/PromptManager";
import { ExtractionCache } from "@/lib/ai/cache/ExtractionCache";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

import crypto from "crypto";
import { OcrSpaceProvider } from "@/lib/ocr/OcrSpaceProvider";
import { DocumentClassifier } from "@/lib/ocr/DocumentClassifier";
import { DocumentTextParser } from "@/lib/ocr/DocumentTextParser";
import { DocumentPreprocessorRouter, MARKITDOWN_PREPROCESSOR_VERSION } from "@/lib/document-preprocessing";

export async function extractDataFromDocuments(formData: FormData) {
  const fullServerActionStart = performance.now();
  const perfTimings: Record<string, number> = {};
  
  try {
    // 2. Supabase Server Client Creation
    const clientCreationStart = performance.now();
    const supabase = await createClient();
    const supabaseClientMs = performance.now() - clientCreationStart;
    
    // 1. Auth/session lookup
    const authLookupStart = performance.now();
    const { data: { user } } = await supabase.auth.getUser();
    const authSessionMs = performance.now() - authLookupStart;

    if (!user) throw new Error("Unauthorized");

    // 3. File arrayBuffer/read
    const fileReadStart = performance.now();
    const files = formData.getAll('files') as File[];
    const documentTypesRaw = formData.get('documentTypes') as string;
    const documentTypes = documentTypesRaw ? JSON.parse(documentTypesRaw) : [];
    
    if (files.length === 0) {
      throw new Error("No files provided for extraction");
    }

    if (files.length > 10) {
      throw new Error("Maximum 10 documents allowed per import batch.");
    }

    const fileDataArray = [];
    const cacheHashFileDataArray = [];
    const originalImages: string[] = [];
    let approximateTotalImageSize = 0;
    const extractedMarkdownSections: string[] = [];
    let hasMarkItDownText = false;
    let anyFallbackTriggered = false;
    let totalPreprocessingMs = 0;

    for (const file of files) {
      approximateTotalImageSize += file.size;
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith('.tif') || lowerName.endsWith('.tiff') || file.type.includes('tiff')) {
        throw new Error(`File ${file.name}: TIFF format is not supported for this release. Please convert to PDF, JPG, PNG, or WEBP.`);
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        throw new Error(`File ${file.name} exceeds 10MB file size limit.`);
      }
      
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      const isAllowedExt = lowerName.endsWith('.pdf') || lowerName.endsWith('.docx') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp');

      if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/') && !isAllowedExt) {
        throw new Error(`File type ${file.type || file.name} is not supported. Use JPG, PNG, WEBP, PDF, DOCX, or XLSX.`);
      }

      // Convert File to buffer & base64
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');
      originalImages.push(file.name);

      // Track all input files for cache key stability
      cacheHashFileDataArray.push({
        mimeType: file.type || 'application/octet-stream',
        base64Data: base64
      });

      // Preprocessing Route Check
      const prepStart = performance.now();
      const prepRes = await DocumentPreprocessorRouter.routeAndPreprocess(buffer, file.name, file.type);
      totalPreprocessingMs += performance.now() - prepStart;

      if (prepRes.fallbackRequired) {
        anyFallbackTriggered = true;
        console.log(`[AI Preprocessor] Fallback triggered for ${file.name}: routing to Vision/OCR pipeline`);
      }

      if (prepRes.source === 'markitdown' && prepRes.markdown) {
        hasMarkItDownText = true;
        console.log(`[AI Preprocessor] Document processed with MarkItDown: format=${prepRes.metadata?.format} length=${prepRes.metadata?.markdown_length} duration_ms=${prepRes.metadata?.duration_ms}`);
        extractedMarkdownSections.push(`Source Document: ${file.name}\n${prepRes.markdown}`);
      } else if (prepRes.source === 'none') {
        throw new Error(prepRes.error || `Failed to process document ${file.name}.`);
      } else {
        // Image or Scanned PDF falling back to Vision
        fileDataArray.push({
          mimeType: file.type || 'application/pdf',
          base64Data: base64
        });
      }
    }
    const fileReadMs = performance.now() - fileReadStart;
    perfTimings.imagePreparation = fileReadMs;
    perfTimings.preprocessingTime = totalPreprocessingMs;

    // Prompt setup
    const providerName = process.env.DEFAULT_AI_PROVIDER || 'gemini';
    const promptVersion = process.env.PROMPT_VERSION || 'v1';
    const modelName = 'gemini-flash-latest';
    
    const combinedMarkdown = extractedMarkdownSections.join('\n\n---\n\n');

    const finalPrompt = PromptManager.generateFinalPrompt({
      provider: providerName as any,
      version: promptVersion as any,
      documentTypes: documentTypes,
      inputMode: hasMarkItDownText ? 'markdown' : 'vision',
      markdownContent: hasMarkItDownText ? combinedMarkdown : undefined
    });

    const reqId = uuidv4().substring(0, 8);
    console.log(`[AI] extraction_start requestId=${reqId} preprocessing=${hasMarkItDownText ? 'markitdown' : 'vision'} files=${files.length}`);

    // 4 & 5. SHA-256 File Hash and Request Hash Generation
    const hashStart = performance.now();
    const sha256Start = performance.now();
    const fileHashes = cacheHashFileDataArray.map(f => {
      const buf = Buffer.from(f.base64Data, 'base64');
      return crypto.createHash('sha256').update(buf).digest('hex');
    }).sort();
    const sha256FileHashMs = performance.now() - sha256Start;

    const requestHashGenStart = performance.now();
    const requestHash = ExtractionCache.computeRequestHash({
      files: cacheHashFileDataArray,
      documentTypes,
      promptVersion,
      modelName,
      preprocessingMode: hasMarkItDownText ? MARKITDOWN_PREPROCESSOR_VERSION : 'vision'
    });
    const requestHashGenMs = performance.now() - requestHashGenStart;
    const totalRequestHashMs = performance.now() - hashStart;

    // 6, 7 & 11. Cache Select Query, JSON Deserialization, and Stats Update Timing
    const cacheLookupStart = performance.now();
    const cacheRes = await ExtractionCache.lookupCache(supabase, user.id, requestHash);
    const totalCacheLookupMs = performance.now() - cacheLookupStart;
    const cacheHit = cacheRes.hit;
    const cacheLookupMs = cacheRes.lookupMs;
    let cacheWriteMs = 0;
    let savedProviderMs = 0;

    let extractionResult: any = null;
    let finalProviderName = providerName;
    let fallbackTriggered = false;
    let providerStartTime = Date.now();
    let primaryAttemptMs = 0;
    let retryAttemptMs = 0;
    let primaryStatus = 'success';
    let primaryErrorCategory = 'NONE';

    if (cacheHit && cacheRes.resultJson) {
      savedProviderMs = 4500; // Estimated API time saved
      console.log(`[AI Cache] ⚡ CACHE HIT requestId=${reqId} hash=${requestHash.substring(0, 8)} lookupMs=${cacheLookupMs.toFixed(2)}ms`);
      
      let parsedCacheJson = cacheRes.resultJson;
      if (typeof parsedCacheJson === 'string') {
        try {
          parsedCacheJson = JSON.parse(parsedCacheJson);
        } catch (e) {
          console.warn("[AI Cache] Failed to parse cached JSON string");
        }
      }

      extractionResult = {
        status: 'success',
        parsedJson: parsedCacheJson,
        modelName: modelName,
        processingTimeMs: cacheLookupMs,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0
      };
      
      perfTimings.primaryAttemptDuration = 0;
      perfTimings.fallbackAttemptDuration = 0;
    } else {
      console.log(`[AI Cache] 🔍 CACHE MISS requestId=${reqId} hash=${requestHash.substring(0, 8)}`);
      
      const TOTAL_AI_BUDGET_MS = 15000;
      providerStartTime = Date.now();

      // Get the AI Provider from Registry
      const provider = AIProviderRegistry.getProvider(providerName);

      // Call AI Extraction (Primary attempt + capped retry)
      const primaryStart = Date.now();
      console.log(`[AI] gemini_start requestId=${reqId}`);
      extractionResult = await provider.extractData(
        "You are a highly accurate Document Extraction AI.", 
        finalPrompt, 
        fileDataArray,
        { reqId } as any
      );
      
      primaryAttemptMs = extractionResult.primaryAttemptMs || (Date.now() - primaryStart);
      retryAttemptMs = extractionResult.retryAttemptMs || 0;
      perfTimings.primaryAttemptDuration = Date.now() - primaryStart;
      
      console.log(`[AI] gemini_end requestId=${reqId} primary_attempt_ms=${primaryAttemptMs} retry_attempt_ms=${retryAttemptMs} duration=${perfTimings.primaryAttemptDuration}ms status=${extractionResult.status} category=${extractionResult.errorCategory}`);

      primaryStatus = extractionResult.status;
      primaryErrorCategory = extractionResult.errorCategory || 'UNKNOWN';
      perfTimings.fallbackAttemptDuration = 0;

      // Fallback Architecture with budget check
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
          
          const fallbackModel = process.env.OPENROUTER_MODEL || 'google/gemini-3.5-flash-lite';
          extractionResult = await fallbackProvider.extractData(
            "You are a highly accurate Document Extraction AI.", 
            finalPrompt, 
            fileDataArray,
            { 
              reqId: reqId + '-fb', 
              timeoutMs: Math.min(8000, remainingBudgetMs),
              model: fallbackModel
            } as any
          );
          
          perfTimings.fallbackAttemptDuration = Date.now() - fallbackStart;
          finalProviderName = fallbackProvider.getName();
          console.log(`[AI] fallback_end requestId=${reqId} fallback_attempt_ms=${perfTimings.fallbackAttemptDuration}ms status=${extractionResult.status}`);
        } else {
          console.warn(`[AI Extraction] Primary provider '${providerName}' failed (${extractionResult.errorCategory}). Category does not qualify for fallback.`);
        }
      }

      // If extraction was valid & successful, save to cache!
      if (extractionResult.status === 'success' && extractionResult.parsedJson && typeof extractionResult.parsedJson === 'object') {
        const saveRes = await ExtractionCache.saveCache(supabase, {
          requestHash,
          userId: user.id,
          provider: finalProviderName,
          modelName: extractionResult.modelName || modelName,
          promptVersion,
          resultJson: extractionResult.parsedJson
        });
        cacheWriteMs = saveRes.writeMs;
      }
    }

    const totalProviderMs = Date.now() - providerStartTime;
    console.log(`[AI] provider_pipeline_summary primary_attempt_ms=${primaryAttemptMs} retry_attempt_ms=${retryAttemptMs} fallback_attempt_ms=${perfTimings.fallbackAttemptDuration} total_provider_ms=${totalProviderMs} final_provider=${finalProviderName}`);

    // 12. Profile Photo Crop & Upload Deferred (Opt-in on 'Use Photo' click only)
    const photoCropStart = performance.now();
    const photoProcessingTime = 0;
    const ranPhotoCropOnCacheHit = false;
    const totalPhotoCropLogicMs = performance.now() - photoCropStart;
    
    // 8. Normalization (Server-side portion)
    const normStart = performance.now();
    perfTimings.normalizationAndMerge = Date.now() - normStart - photoProcessingTime;
    const serverNormMs = performance.now() - normStart;

    // 10. Save to AI Import History DB Logging (Offloaded from critical path using Next.js 16 after() API)
    const dbLogStart = performance.now();
    
    after(async () => {
      const bgLogStart = performance.now();
      try {
        const { error: dbError } = await supabase
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
          }]);

        const bgDuration = performance.now() - bgLogStart;
        if (dbError) {
          console.error("[ai_import_history after()] Error saving history:", dbError.message);
        } else {
          console.log(`[ai_import_history after()] Audit history saved asynchronously in ${bgDuration.toFixed(2)} ms`);
        }
      } catch (logErr: any) {
        console.error("[ai_import_history after()] Logging exception:", logErr.message || logErr);
      }
    });

    const dbLoggingMs = performance.now() - dbLogStart;
    perfTimings.databaseLogging = dbLoggingMs;

    // 14. revalidatePath / Router Refresh timing check
    const revalidateStart = performance.now();
    const revalidateWorkMs = performance.now() - revalidateStart;

    if (extractionResult.status === 'failed' || !extractionResult.parsedJson) {
      let userFacingError = extractionResult.errorMessage || "AI extraction failed to extract valid data.";
      
      const isPrimaryQuotaOrRateLimit = primaryErrorCategory === 'RATE_LIMIT' || primaryErrorCategory === 'QUOTA';
      const isFallbackQuotaOrRateLimit = extractionResult.errorCategory === 'QUOTA' || extractionResult.errorCategory === 'RATE_LIMIT';

      if (isPrimaryQuotaOrRateLimit && isFallbackQuotaOrRateLimit) {
        userFacingError = "Primary and backup AI quotas are temporarily unavailable. Please try again later.";
      }

      return {
        success: false,
        error: userFacingError
      };
    }

    // 13. Server Action Result Serialization
    const serializationStart = performance.now();
    const resultResponse = { 
      success: true, 
      data: extractionResult.parsedJson,
      perfSummary: {
        provider: finalProviderName,
        model: extractionResult.modelName || modelName,
        documentCount: files.length,
        imagePrepTime: perfTimings.imagePreparation,
        primaryAttemptDuration: perfTimings.primaryAttemptDuration,
        fallbackAttemptDuration: perfTimings.fallbackAttemptDuration,
        preprocessingTime: totalPreprocessingMs,
        preprocessingSource: hasMarkItDownText ? 'markitdown' : 'vision',
        fallbackUsed: anyFallbackTriggered,
        apiTime: extractionResult.apiCallTimeMs || 0,
        jsonParseTime: extractionResult.jsonParseTimeMs || 0,
        normalizationTime: perfTimings.normalizationAndMerge,
        dbLogTime: perfTimings.databaseLogging,
        totalTime: performance.now() - fullServerActionStart,
        cacheHit: cacheHit,
        cacheLookupMs: totalCacheLookupMs,
        cacheWriteMs: cacheWriteMs,
        savedProviderMs: savedProviderMs
      }
    };
    JSON.stringify(resultResponse);
    const serializationMs = performance.now() - serializationStart;

    // 15. Full Server Action Duration
    const fullServerActionMs = performance.now() - fullServerActionStart;

    // DETAILED PROFILING REPORT PRINT
    console.log("==========================================================================");
    console.log(" 🔍 DEV-ONLY CACHE-HIT PROFILING REPORT (DIAGNOSE ONLY)                   ");
    console.log("==========================================================================");
    console.log(` 1. Auth / Session Lookup:           ${authSessionMs.toFixed(2)} ms`);
    console.log(` 2. Supabase Server Client Creation: ${supabaseClientMs.toFixed(2)} ms`);
    console.log(` 3. File arrayBuffer / Read:         ${fileReadMs.toFixed(2)} ms`);
    console.log(` 4. SHA-256 File Hash:               ${sha256FileHashMs.toFixed(2)} ms`);
    console.log(` 5. Request Hash Generation:         ${requestHashGenMs.toFixed(2)} ms (Total Hash: ${totalRequestHashMs.toFixed(2)} ms)`);
    console.log(` 6. Cache Select Query:              ${(cacheRes.selectQueryMs || totalCacheLookupMs).toFixed(2)} ms`);
    console.log(` 7. Cache JSON Deserialization:      ${(cacheRes.jsonDeserializationMs || 0).toFixed(2)} ms`);
    console.log(` 8. DataNormalizer (Server portion): ${serverNormMs.toFixed(2)} ms`);
    console.log(` 9. MergeEngine (Server portion):    0.00 ms (Runs on Client)`);
    console.log(`10. ai_import_history Insert:        ${dbLoggingMs.toFixed(2)} ms`);
    console.log(`11. Cache hit_count Update:          ${(cacheRes.statsUpdateMs || 0).toFixed(2)} ms`);
    console.log(`12. Profile-Photo/Crop Logic:        ${totalPhotoCropLogicMs.toFixed(2)} ms (Ran on cache hit: ${ranPhotoCropOnCacheHit})`);
    console.log(`13. Result Serialization:            ${serializationMs.toFixed(2)} ms`);
    console.log(`14. revalidatePath / Refresh Work:   ${revalidateWorkMs.toFixed(2)} ms`);
    console.log(`15. Full Server Action Duration:     ${fullServerActionMs.toFixed(2)} ms`);
    console.log("--------------------------------------------------------------------------");
    const accountedMs = authSessionMs + supabaseClientMs + fileReadMs + totalRequestHashMs + totalCacheLookupMs + totalPhotoCropLogicMs + serverNormMs + dbLoggingMs + serializationMs;
    const unaccountedMs = fullServerActionMs - accountedMs;
    console.log(` Accounted Sub-Operations Total:     ${accountedMs.toFixed(2)} ms`);
    console.log(` Remaining Unaccounted:              ${unaccountedMs.toFixed(2)} ms`);
    console.log("==========================================================================");

    return resultResponse;

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

export async function cropAndUploadProfilePhoto(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const file = formData.get("file") as File;
    const boxJson = formData.get("bounding_box") as string;

    if (!file || !boxJson) {
      return { success: false, error: "File and bounding_box are required" };
    }

    const box = JSON.parse(boxJson);
    if (!Array.isArray(box) || box.length !== 4) {
      return { success: false, error: "Invalid bounding_box format" };
    }

    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const [ymin, xmin, ymax, xmax] = box;
    const sharpImg = sharp(imageBuffer);
    const metadata = await sharpImg.metadata();

    if (!metadata.width || !metadata.height) {
      return { success: false, error: "Unable to read image dimensions" };
    }

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

    if (ymin >= ymax || xmin >= xmax || x < 0 || y < 0 || w <= 20 || h <= 20 || x >= metadata.width || y >= metadata.height) {
      return { success: false, error: "Invalid crop dimensions" };
    }

    if (x + w > metadata.width) w = metadata.width - x;
    if (y + h > metadata.height) h = metadata.height - y;

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

    if (uploadError) {
      return { success: false, error: uploadError.message };
    }

    const { data: signedData } = await supabase.storage
      .from('customer-profiles')
      .createSignedUrl(fileName, 3600);

    return {
      success: true,
      storagePath: fileName,
      signedUrl: signedData?.signedUrl
    };
  } catch (error: any) {
    console.error("[cropAndUploadProfilePhoto] Error:", error);
    return { success: false, error: error.message };
  }
}

export async function getAiProviderStatus(): Promise<{
  gemini: boolean;
  openai: boolean;
  claude: boolean;
  local: boolean;
}> {
  return {
    gemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0,
    openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 0,
    claude: !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0,
    local: true,
  };
}

export async function generateCustomerJsonWithProvider(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const providerId = (formData.get("provider") as string || "gemini").toLowerCase();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      throw new Error("No files provided for extraction");
    }

    if (files.length > 10) {
      throw new Error("Maximum 10 documents allowed per import batch.");
    }

    const fileDataArray = [];
    const extractedMarkdownSections: string[] = [];
    let hasMarkItDownText = false;

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error(`File ${file.name} exceeds 10MB file size limit.`);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');

      const prepRes = await DocumentPreprocessorRouter.routeAndPreprocess(buffer, file.name, file.type);
      if (prepRes.source === 'markitdown' && prepRes.markdown) {
        hasMarkItDownText = true;
        extractedMarkdownSections.push(`Source Document: ${file.name}\n${prepRes.markdown}`);
      } else if (prepRes.source === 'none') {
        throw new Error(prepRes.error || `Failed to process document ${file.name}.`);
      } else {
        fileDataArray.push({
          mimeType: file.type || 'application/pdf',
          base64Data: base64
        });
      }
    }

    const promptVersion = process.env.PROMPT_VERSION || 'v1';
    const finalPrompt = PromptManager.generateFinalPrompt({
      provider: providerId as any,
      version: promptVersion as any,
      documentTypes: [],
      inputMode: hasMarkItDownText ? 'markdown' : 'vision',
      markdownContent: hasMarkItDownText ? extractedMarkdownSections.join('\n\n---\n\n') : undefined
    });

    const provider = AIProviderRegistry.getProvider(providerId);
    const result = await provider.extractData(
      "You are a highly accurate Document Extraction AI.",
      finalPrompt,
      fileDataArray
    );

    if (result.status === 'failed' || !result.parsedJson) {
      return {
        success: false,
        error: result.errorMessage || `${providerId.toUpperCase()} extraction failed.`
      };
    }

    const parsed = result.parsedJson;
    const canonicalJson = {
      customer: parsed.customer || {},
      address: parsed.address || {},
      documents: parsed.documents || {},
      detected_documents: parsed.detected_documents || [],
      confidence_summary: parsed.confidence_summary || { overall: 0.9, low_confidence_fields: [] }
    };

    return {
      success: true,
      data: canonicalJson,
      provider: providerId,
      model: result.modelName
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to generate JSON with selected provider."
    };
  }
}

export async function processOcrSpaceDocument(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const files = formData.getAll('files') as File[];
    if (files.length === 0) {
      throw new Error("No documents provided for OCR.space processing.");
    }

    if (files.length > 10) {
      throw new Error("Maximum 10 documents allowed per import batch.");
    }

    const allParsedData: any[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ocrResult = await OcrSpaceProvider.extractText({
        buffer,
        filename: file.name,
        mimeType: file.type
      });

      if (!ocrResult.success || !ocrResult.text) {
        return {
          success: false,
          error: ocrResult.error || `OCR.space failed to read text from ${file.name}.`
        };
      }

      const extractedText = ocrResult.text;
      const classification = DocumentClassifier.classify(extractedText);
      const detectedType = classification.documentType;
      const parsedFields = DocumentTextParser.parse(extractedText, detectedType);

      allParsedData.push(parsedFields);
    }

    if (allParsedData.length === 0) {
      throw new Error("Could not parse customer data from OCR results.");
    }

    const combinedCustomer: Record<string, any> = {};
    const combinedAddress: Record<string, any> = {};
    const combinedDocuments: Record<string, any> = {};

    for (const parsed of allParsedData) {
      if (parsed.customer) {
        Object.entries(parsed.customer).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            if (!combinedCustomer[k] || (typeof v === 'string' && v.length > String(combinedCustomer[k]).length)) {
              combinedCustomer[k] = v;
            }
          }
        });
      }

      if (parsed.address) {
        Object.entries(parsed.address).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            const detectedDocType = parsed.detected_documents?.[0]?.detected_type || '';
            const isBack = detectedDocType.includes('back') || detectedDocType.includes('combined');
            if (isBack || !combinedAddress[k] || (typeof v === 'string' && v.length > String(combinedAddress[k]).length)) {
              combinedAddress[k] = v;
            }
          }
        });
      }

      if (parsed.documents) {
        Object.entries(parsed.documents).forEach(([k, v]) => {
          if (v && (v as any).number) {
            combinedDocuments[k] = v;
          }
        });
      }
    }

    const firstParsed = allParsedData[0] || {};
    const combinedJson = {
      customer: combinedCustomer,
      address: combinedAddress,
      documents: combinedDocuments,
      detected_documents: allParsedData.flatMap(d => d.detected_documents || []),
      confidence_summary: firstParsed.confidence_summary || { overall: 0.9, low_confidence_fields: [] }
    };

    return {
      success: true,
      data: combinedJson
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || "OCR.space document extraction failed."
    };
  }
}


