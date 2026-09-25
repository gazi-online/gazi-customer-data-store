"use server";

import { after } from "next/server";
import { AIProviderRegistry } from "@/lib/ai/providers";
import { PromptManager } from "@/lib/ai/prompts/PromptManager";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { OcrSpaceProvider } from "@/lib/ocr/OcrSpaceProvider";
import { DocumentClassifier } from "@/lib/ocr/DocumentClassifier";
import { DocumentTextParser } from "@/lib/ocr/DocumentTextParser";
import { MarkdownTextAdapter } from "@/lib/ocr/MarkdownTextAdapter";
import { ExtractionCompletenessEvaluator } from "@/lib/ocr/ExtractionCompletenessEvaluator";
import { DocumentPreprocessorRouter } from "@/lib/document-preprocessing";
import { ParsedDocumentFields } from "@/lib/ocr/ocr-types";

import {
  countUsableFields,
  getSmartImportFailure
} from "@/lib/ocr/errorClassification";
import { requireAal2 } from "@/lib/auth/mfaEnforcement";

export async function extractDataFromDocuments(formData: FormData) {
  const fullServerActionStart = performance.now();
  const perfTimings: Record<string, number> = {};
  
  try {
    const supabase = await createClient();
    const { user } = await requireAal2(supabase);

    const fileReadStart = performance.now();
    const files = formData.getAll('files') as File[];
    const documentTypesRaw = formData.get('documentTypes') as string;
    const documentTypes = documentTypesRaw ? JSON.parse(documentTypesRaw) : [];
    
    // Feature flag: strictly exact string "true"
    const isAiFlagTrue = process.env.SMART_IMPORT_AI_ENHANCEMENT_ENABLED === 'true';
    const isExplicitAi = formData.get('enableAiEnhancement') === 'true';
    const allowAiEnhancement = isAiFlagTrue || isExplicitAi;

    if (files.length === 0) {
      throw new Error("No files provided for extraction");
    }

    if (files.length > 10) {
      throw new Error("Maximum 10 documents allowed per import batch.");
    }

    const fileDataArray: Array<{ mimeType: string; base64Data: string }> = [];
    const originalImages: string[] = [];
    const extractedMarkdownSections: string[] = [];
    let hasMarkItDownText = false;
    let anyFallbackTriggered = false;
    let totalPreprocessingMs = 0;
    let anyTextExtracted = false;

    const allParsedData: ParsedDocumentFields[] = [];
    const sourcesUsed: string[] = [];

    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      const ext = path.extname(lowerName);

      if (lowerName.endsWith('.tif') || lowerName.endsWith('.tiff') || file.type.includes('tiff')) {
        throw new Error(`File ${file.name}: TIFF format is not supported for this release. Please convert to PDF, JPG, PNG, or WEBP.`);
      }

      if (file.size > 10 * 1024 * 1024) {
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

      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');
      originalImages.push(file.name);

      const isImage = ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || file.type.startsWith('image/');
      const isPdf = ext === '.pdf' || file.type === 'application/pdf';
      const isOffice = ext === '.docx' || ext === '.xlsx' || file.type.includes('wordprocessingml') || file.type.includes('spreadsheetml');

      // 1. Image Routing: PRIMARY -> OCR.Space -> DocumentClassifier -> DocumentTextParser
      if (isImage) {
        const hasOcrKey = Boolean(process.env.OCR_SPACE_API_KEY?.trim());

        if (!hasOcrKey) {
          // OCR.Space key absent: surface manual review signal without disclosing key name
          // Do NOT silently redirect into Gemini/OpenRouter even if AI enhancement is enabled
          fileDataArray.push({
            mimeType: file.type || 'image/jpeg',
            base64Data: base64,
            // Marker for manual review fallback path
            _ocrUnavailable: true
          } as unknown as { mimeType: string; base64Data: string });
        } else {
          const ocrRes = await OcrSpaceProvider.extractText({
            buffer,
            filename: file.name,
            mimeType: file.type || 'image/jpeg'
          });

          if (ocrRes.success && ocrRes.text) {
            const trimmed = ocrRes.text.trim();
            if (trimmed.length > 0) {
              anyTextExtracted = true;
            }
            const classification = DocumentClassifier.classify(ocrRes.text);
            const parsed = DocumentTextParser.parse(ocrRes.text, classification.documentType, file.name);
            allParsedData.push(parsed);
            sourcesUsed.push('ocr-space');
          } else if (ocrRes.errorCategory === 'AUTHENTICATION') {
            // Authentication error from OCR.Space — do not expose key name to AI path
            fileDataArray.push({
              mimeType: file.type || 'image/jpeg',
              base64Data: base64,
              _ocrUnavailable: true
            } as unknown as { mimeType: string; base64Data: string });
          } else {
            // Transient OCR failure: buffer for optional AI fallback if allowed
            fileDataArray.push({
              mimeType: file.type || 'image/jpeg',
              base64Data: base64
            });
          }
        }
      }
      // 2. Structured Document Routing (PDF / DOCX / XLSX)
      else if (isPdf) {
        const prepStart = performance.now();
        const prepRes = await DocumentPreprocessorRouter.routeAndPreprocess(buffer, file.name, file.type);
        totalPreprocessingMs += performance.now() - prepStart;

        if (prepRes.source === 'markitdown' && prepRes.markdown) {
          const trimmed = prepRes.markdown.trim();
          if (trimmed.length > 0) {
            anyTextExtracted = true;
          }
          hasMarkItDownText = true;
          extractedMarkdownSections.push(`Source Document: ${file.name}\n${prepRes.markdown}`);
          const structured = MarkdownTextAdapter.adaptToStructuredText(prepRes.markdown);
          const classification = DocumentClassifier.classify(structured);
          const parsed = DocumentTextParser.parse(structured, classification.documentType, file.name);
          allParsedData.push(parsed);
          sourcesUsed.push('markitdown');
        } else if (prepRes.fallbackRequired || prepRes.source === 'existing-ocr') {
          // Scanned / Image-only PDF -> Fallback to OCR.Space!
          anyFallbackTriggered = true;
          const ocrRes = await OcrSpaceProvider.extractText({
            buffer,
            filename: file.name,
            mimeType: 'application/pdf'
          });

          if (ocrRes.success && ocrRes.text) {
            const trimmed = ocrRes.text.trim();
            if (trimmed.length > 0) {
              anyTextExtracted = true;
            }
            const classification = DocumentClassifier.classify(ocrRes.text);
            const parsed = DocumentTextParser.parse(ocrRes.text, classification.documentType, file.name);
            allParsedData.push(parsed);
            sourcesUsed.push('ocr-space');
          } else {
            fileDataArray.push({
              mimeType: 'application/pdf',
              base64Data: base64
            });
          }
        } else {
          fileDataArray.push({
            mimeType: 'application/pdf',
            base64Data: base64
          });
        }
      }
      // 3. DOCX / XLSX Routing (MarkItDown ONLY, NEVER OCR.Space!)
      else if (isOffice) {
        const prepStart = performance.now();
        const prepRes = await DocumentPreprocessorRouter.routeAndPreprocess(buffer, file.name, file.type);
        totalPreprocessingMs += performance.now() - prepStart;

        if (prepRes.source === 'markitdown' && prepRes.markdown) {
          const trimmed = prepRes.markdown.trim();
          if (trimmed.length > 0) {
            anyTextExtracted = true;
          }
          hasMarkItDownText = true;
          extractedMarkdownSections.push(`Source Document: ${file.name}\n${prepRes.markdown}`);
          const structured = MarkdownTextAdapter.adaptToStructuredText(prepRes.markdown);
          const classification = DocumentClassifier.classify(structured);
          const parsed = DocumentTextParser.parse(structured, classification.documentType, file.name);
          allParsedData.push(parsed);
          sourcesUsed.push('markitdown');
        } else {
          if (prepRes.error) {
            console.warn(`[MarkItDown] Office document preprocessing failed: ${prepRes.error}`);
          }
        }
      }
    }

    const fileReadMs = performance.now() - fileReadStart;
    perfTimings.imagePreparation = fileReadMs;
    perfTimings.preprocessingTime = totalPreprocessingMs;

    // Build Canonical GCDS JSON from all locally parsed documents
    let canonicalJson: Record<string, unknown> | null = null;
    if (allParsedData.length > 0) {
      const combinedCustomer: Record<string, unknown> = {};
      const combinedAddress: Record<string, unknown> = {};
      const combinedDocuments: Record<string, unknown> = {};

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
            if (v && typeof v === 'object' && 'number' in v) {
              combinedDocuments[k] = v;
            }
          });
        }
      }

      canonicalJson = {
        customer: combinedCustomer,
        address: combinedAddress,
        documents: combinedDocuments,
        detected_documents: allParsedData.flatMap(d => d.detected_documents || []),
        confidence_summary: { overall: 0.9, low_confidence_fields: [] }
      };
    }

    const hasOcrUnavailableImages = fileDataArray.some(
      f => (f as unknown as { _ocrUnavailable?: boolean })._ocrUnavailable === true
    );

    const localUsableFieldCount = countUsableFields(canonicalJson);

    // Evaluate Completeness
    const evaluation = canonicalJson
      ? ExtractionCompletenessEvaluator.evaluate(canonicalJson)
      : { completeness: 0, requiresAiEnhancement: true, missingImportantFields: ['all'], confidenceSummary: { overall: 0, low_confidence_fields: ['all'] } };

    if (canonicalJson) {
      canonicalJson.confidence_summary = evaluation.confidenceSummary;
    }

    // AI Trigger Condition:
    // Requires BOTH: flag === 'true' (or explicit user request) AND local extraction requires enhancement
    const needsAi = evaluation.requiresAiEnhancement || allParsedData.length === 0 || localUsableFieldCount === 0;
    const shouldTriggerAi = allowAiEnhancement && needsAi;

    const primarySource = sourcesUsed.includes('markitdown')
      ? 'markitdown'
      : (sourcesUsed.includes('ocr-space') ? 'ocr-space' : 'unknown');

    let finalProviderName: string = primarySource;
    let aiEnhancementUsed = false;
    let extractionResult: {
      status: string;
      parsedJson?: Record<string, unknown>;
      modelName?: string;
      processingTimeMs?: number;
      inputTokens?: number;
      outputTokens?: number;
      estimatedCost?: number;
      errorMessage?: string;
      apiCallTimeMs?: number;
      jsonParseTimeMs?: number;
    } | null = null;
    let modelName = 'local-deterministic';

    // PATH A: Standard Local Extraction (AI Enhancement NOT needed or disabled)
    if (!shouldTriggerAi) {
      if (canonicalJson && allParsedData.length > 0 && localUsableFieldCount > 0) {
        extractionResult = {
          status: 'success',
          parsedJson: canonicalJson,
          modelName: 'local-deterministic',
          processingTimeMs: performance.now() - fullServerActionStart,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0
        };
      } else {
        return getSmartImportFailure({
          hasExtractedText: anyTextExtracted,
          usableFieldCount: localUsableFieldCount,
          hasOcrUnavailableImages
        });
      }
    }
    // PATH B: Optional AI Enhancement
    else {
      const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
      const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim().length > 0);

      // If neither AI key is configured, fallback to local extraction without error!
      if (!hasGeminiKey && !hasOpenRouterKey) {
        if (canonicalJson && allParsedData.length > 0 && localUsableFieldCount > 0) {
          extractionResult = {
            status: 'success',
            parsedJson: canonicalJson,
            modelName: 'local-deterministic',
            processingTimeMs: performance.now() - fullServerActionStart,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0
          };
        } else {
          return getSmartImportFailure({
            hasExtractedText: anyTextExtracted,
            usableFieldCount: localUsableFieldCount,
            hasOcrUnavailableImages
          });
        }
      } else {
        const promptProvider: 'gemini' | 'openai' | 'claude' = hasGeminiKey ? 'gemini' : 'openai';
        modelName = hasGeminiKey ? 'gemini-flash-latest' : (process.env.OPENROUTER_MODEL || 'google/gemini-3.5-flash-lite');

        const combinedMarkdown = extractedMarkdownSections.join('\n\n---\n\n');
        const finalPrompt = PromptManager.generateFinalPrompt({
          provider: promptProvider,
          version: 'v1',
          documentTypes: documentTypes,
          inputMode: hasMarkItDownText ? 'markdown' : 'vision',
          markdownContent: hasMarkItDownText ? combinedMarkdown : undefined
        });

        const reqId = uuidv4().substring(0, 8);

        // Remove OCR-unavailable files from the AI fileDataArray — never send image to AI unless
        // both AI enhancement is enabled AND the failure is transient (not key-missing)
        const aiFileDataArray = hasOcrUnavailableImages
          ? fileDataArray.filter(
              f => !(f as unknown as { _ocrUnavailable?: boolean })._ocrUnavailable
            )
          : fileDataArray;

        let rawAiParsedJson: Record<string, unknown> | null = null;

        // Try Gemini if available
        if (hasGeminiKey) {
          try {
            const provider = AIProviderRegistry.getProvider('gemini');
            const res = await provider.extractData(
              "You are a highly accurate Document Extraction AI.",
              finalPrompt,
              aiFileDataArray,
              { reqId }
            );

            if (res.status === 'success' && res.parsedJson) {
              rawAiParsedJson = res.parsedJson as Record<string, unknown>;
              extractionResult = res;
              finalProviderName = 'gemini';
              aiEnhancementUsed = true;
            }
          } catch (geminiErr) {
            console.warn(`[AI Enhancement] Gemini attempt failed:`, geminiErr);
          }
        }

        // Try OpenRouter fallback if Gemini did not succeed
        if (!extractionResult && hasOpenRouterKey) {
          try {
            const fallbackProvider = AIProviderRegistry.getProvider('openrouter');
            const fallbackModel = process.env.OPENROUTER_MODEL || 'google/gemini-3.5-flash-lite';
            const res = await fallbackProvider.extractData(
              "You are a highly accurate Document Extraction AI.",
              finalPrompt,
              aiFileDataArray,
              {
                reqId: reqId + '-fb',
                timeoutMs: 10000,
                model: fallbackModel
              }
            );

            if (res.status === 'success' && res.parsedJson) {
              rawAiParsedJson = res.parsedJson as Record<string, unknown>;
              extractionResult = res;
              finalProviderName = 'openrouter';
              aiEnhancementUsed = true;
            }
          } catch (openRouterErr) {
            console.warn(`[AI Enhancement] OpenRouter attempt failed:`, openRouterErr);
          }
        }

        // AI Non-Overwrite Merge:
        // AI may only FILL missing fields or flag conflicts.
        // AI must NOT silently replace a valid high-confidence local value.
        // Fields with validated formats (Aadhaar, PAN, EPIC) are NEVER replaced by AI.
        if (rawAiParsedJson && canonicalJson && aiEnhancementUsed) {
          const mergedJson: Record<string, unknown> = JSON.parse(JSON.stringify(canonicalJson));
          const mergedCustomer = (mergedJson.customer as Record<string, unknown>) || {};
          const mergedAddress = (mergedJson.address as Record<string, unknown>) || {};
          const mergedDocuments = (mergedJson.documents as Record<string, Record<string, unknown>>) || {};

          const aiCustomer = (rawAiParsedJson.customer as Record<string, unknown>) || {};
          const aiAddress = (rawAiParsedJson.address as Record<string, unknown>) || {};
          const aiDocuments = (rawAiParsedJson.documents as Record<string, Record<string, unknown>>) || {};

          const AADHAAR_RE = /^\d{12}$/;
          const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
          const EPIC_RE = /^([A-Z]{3}[0-9]{7}|[A-Z]{2,3}\/\d{2,3}\/\d{3,4}\/\d{5,7}|[A-Z]{2,3}[0-9]{7,8})$/;

          // HIGH-TRUST local fields — never overwrite if locally valid
          const HIGH_TRUST_CUSTOMER_FIELDS = new Set<string>([
            'full_name', 'dob', 'gender'
          ]);
          const HIGH_TRUST_ADDRESS_FIELDS = new Set<string>(['pincode']);

          // Customer fields: only fill if local is empty; flag conflict if different
          for (const [k, aiVal] of Object.entries(aiCustomer)) {
            if (aiVal === undefined || aiVal === null || aiVal === '') continue;
            const localVal = mergedCustomer[k];
            if (!localVal || localVal === '') {
              // Local field is empty — AI may fill it
              mergedCustomer[k] = aiVal;
            } else if (HIGH_TRUST_CUSTOMER_FIELDS.has(k)) {
              // Local has a value and this is a high-trust field:
              // Check if AI disagrees — if so, mark conflict but keep local
              const aiStr = String(aiVal).trim().toLowerCase();
              const localStr = String(localVal).trim().toLowerCase();
              if (aiStr !== localStr) {
                // Record conflict — local value preserved
                const conflicts = (mergedJson.conflicts as Array<unknown>) || [];
                conflicts.push({ field: k, local: localVal, ai: aiVal, fieldSource: 'conflict' });
                mergedJson.conflicts = conflicts;
                // Mark provenance
                mergedCustomer[`_${k}_source`] = 'conflict';
              }
            }
            // Non-high-trust customer fields: fill if missing, else keep local
          }

          // Address fields
          for (const [k, aiVal] of Object.entries(aiAddress)) {
            if (aiVal === undefined || aiVal === null || aiVal === '') continue;
            const localVal = mergedAddress[k];
            if (!localVal || localVal === '') {
              mergedAddress[k] = aiVal;
            } else if (HIGH_TRUST_ADDRESS_FIELDS.has(k)) {
              const aiStr = String(aiVal).trim();
              const localStr = String(localVal).trim();
              if (aiStr !== localStr) {
                const conflicts = (mergedJson.conflicts as Array<unknown>) || [];
                conflicts.push({ field: `address.${k}`, local: localVal, ai: aiVal, fieldSource: 'conflict' });
                mergedJson.conflicts = conflicts;
                mergedAddress[`_${k}_source`] = 'conflict';
              }
            }
          }

          // Document ID fields — STRICT: never overwrite a locally validated ID
          for (const [docType, aiDocObj] of Object.entries(aiDocuments)) {
            if (!aiDocObj || typeof aiDocObj !== 'object') continue;
            const aiIdNum = String((aiDocObj as Record<string, unknown>).number || '').toUpperCase().replace(/[\s-]+/g, '');
            if (!aiIdNum) continue;

            const localDoc = mergedDocuments[docType] as Record<string, unknown> | undefined;
            const localIdNum = localDoc?.number ? String(localDoc.number).toUpperCase().replace(/[\s-]+/g, '') : '';

            // Validate locally extracted ID
            let localIsValid = false;
            if (docType === 'aadhaar') localIsValid = AADHAAR_RE.test(localIdNum);
            else if (docType === 'pan') localIsValid = PAN_RE.test(localIdNum);
            else if (docType === 'voter_id') localIsValid = EPIC_RE.test(localIdNum);
            else localIsValid = localIdNum.length >= 4;

            if (!localIdNum) {
              // Local has no ID — AI may provide it
              mergedDocuments[docType] = { ...(localDoc || {}), ...aiDocObj, number: aiIdNum };
            } else if (localIsValid && aiIdNum !== localIdNum) {
              // Local is valid but AI disagrees — flag conflict, keep local
              const conflicts = (mergedJson.conflicts as Array<unknown>) || [];
              conflicts.push({
                field: `${docType}.number`,
                local: '[REDACTED]',
                ai: '[REDACTED]',
                fieldSource: 'conflict'
              });
              mergedJson.conflicts = conflicts;
              mergedDocuments[docType] = { ...(localDoc || {}), _number_source: 'conflict' };
            } else if (!localIsValid && localIdNum && aiIdNum) {
              // Invalid/ambiguous local field + AI suggestion:
              // Do NOT silently overwrite; mark/propose for review with provenance
              const conflicts = (mergedJson.conflicts as Array<unknown>) || [];
              conflicts.push({
                field: `${docType}.number`,
                local: localDoc?.number,
                ai: aiIdNum,
                fieldSource: 'review_required',
                status: 'ambiguous_requires_review'
              });
              mergedJson.conflicts = conflicts;
              mergedDocuments[docType] = {
                ...(localDoc || {}),
                _number_source: 'review_required',
                _ai_suggested_number: aiIdNum
              };
            }
          }

          mergedJson.customer = mergedCustomer;
          mergedJson.address = mergedAddress;
          mergedJson.documents = mergedDocuments;

          // Re-evaluate completeness on the merged customer data
          const mergedEval = ExtractionCompletenessEvaluator.evaluate(mergedJson);
          mergedJson.confidence_summary = mergedEval.confidenceSummary;

          extractionResult = {
            ...extractionResult!,
            parsedJson: mergedJson
          };
        }

        // If AI enhancement failed, fall back to local parsed data if we have any
        if (!extractionResult && canonicalJson && allParsedData.length > 0 && localUsableFieldCount > 0) {
          extractionResult = {
            status: 'success',
            parsedJson: canonicalJson,
            modelName: 'local-deterministic',
            processingTimeMs: performance.now() - fullServerActionStart,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCost: 0
          };
          finalProviderName = primarySource;
          aiEnhancementUsed = false;
        } else if (!extractionResult) {
          return getSmartImportFailure({
            hasExtractedText: anyTextExtracted,
            usableFieldCount: localUsableFieldCount,
            hasOcrUnavailableImages
          });
        }
      }
    }

    if (!extractionResult || !extractionResult.parsedJson) {
      return getSmartImportFailure({
        hasExtractedText: anyTextExtracted,
        usableFieldCount: 0,
        hasOcrUnavailableImages
      });
    }

    const finalUsableFieldCount = countUsableFields(extractionResult.parsedJson as Record<string, unknown>);
    if (finalUsableFieldCount === 0) {
      return getSmartImportFailure({
        hasExtractedText: anyTextExtracted,
        usableFieldCount: 0,
        hasOcrUnavailableImages
      });
    }

    const finalEval = extractionResult.parsedJson
      ? ExtractionCompletenessEvaluator.evaluate(extractionResult.parsedJson as Record<string, unknown>)
      : evaluation;

    const isPartial = finalEval.completeness < 0.95 || finalEval.missingImportantFields.length > 0;
    const extractionCode = isPartial ? 'PARTIAL_EXTRACTION' : 'FULL_PARSE';
    const warningMessage = isPartial ? "We could read the document, but some details need your review." : undefined;

    // Save audit log asynchronously
    after(async () => {
      try {
        await supabase
          .from('ai_import_history')
          .insert([{
            created_by: user.id,
            original_images: JSON.stringify(originalImages),
            ai_raw_response: "[REDACTED FOR PRIVACY]",
            final_json: extractionResult.parsedJson || null,
            ai_provider: finalProviderName,
            prompt_version: process.env.PROMPT_VERSION || 'v1',
            status: extractionResult.status,
            processing_time_ms: extractionResult.processingTimeMs || (performance.now() - fullServerActionStart),
            input_tokens: extractionResult.inputTokens || 0,
            output_tokens: extractionResult.outputTokens || 0,
            estimated_cost: extractionResult.estimatedCost || 0,
            model_name: extractionResult.modelName || modelName,
            error_message: extractionResult.errorMessage || null
          }]);
      } catch (logErr: unknown) {
        const err = logErr as Error;
        console.error("[ai_import_history after()] Logging exception:", err.message || err);
      }
    });

    const resultResponse = { 
      success: true, 
      data: extractionResult.parsedJson,
      code: extractionCode,
      warning: warningMessage,
      perfSummary: {
        provider: finalProviderName,
        model: extractionResult.modelName || modelName,
        extractionSource: primarySource,
        aiEnhancementUsed: aiEnhancementUsed,
        completeness: finalEval.completeness,
        documentCount: files.length,
        imagePrepTime: perfTimings.imagePreparation || 0,
        primaryAttemptDuration: 0,
        fallbackAttemptDuration: 0,
        preprocessingTime: totalPreprocessingMs,
        preprocessingSource: hasMarkItDownText ? 'markitdown' : (sourcesUsed.includes('ocr-space') ? 'ocr-space' : 'vision'),
        fallbackUsed: anyFallbackTriggered,
        apiTime: extractionResult.apiCallTimeMs || 0,
        jsonParseTime: extractionResult.jsonParseTimeMs || 0,
        normalizationTime: 0,
        dbLogTime: 0,
        totalTime: performance.now() - fullServerActionStart,
        cacheHit: false,
        cacheLookupMs: 0,
        cacheWriteMs: 0,
        savedProviderMs: 0
      }
    };

    return resultResponse;

  } catch (error: unknown) {
    const err = error as Error;
    console.error("[extractDataFromDocuments] Error:", err);
    return { success: false, error: err.message };
  }
}

export async function testGeminiConnection() {
  try {
    const supabase = await createClient();
    await requireAal2(supabase);
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
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[testGeminiConnection] Error:", err);
    return { success: false, error: "Failed to connect to Gemini API: " + err.message };
  }
}

export async function getProfilePhotoSignedUrl(path: string | null) {
  if (!path) return null;
  try {
    const supabase = await createClient();
    await requireAal2(supabase);
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
    const { user } = await requireAal2(supabase);

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
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[cropAndUploadProfilePhoto] Error:", err);
    return { success: false, error: err.message };
  }
}

export async function getAiProviderStatus(): Promise<{
  gemini: boolean;
  openai: boolean;
  claude: boolean;
  local: boolean;
}> {
  const supabase = await createClient();
  await requireAal2(supabase);
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
    await requireAal2(supabase);

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

    const mappedProvider: 'gemini' | 'openai' | 'claude' =
      providerId === 'claude' ? 'claude' : (providerId === 'chatgpt' ? 'openai' : 'gemini');
    const finalPrompt = PromptManager.generateFinalPrompt({
      provider: mappedProvider,
      version: 'v1',
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
  } catch (error: unknown) {
    const err = error as Error;
    return {
      success: false,
      error: err.message || "Failed to generate JSON with selected provider."
    };
  }
}

export async function processOcrSpaceDocument(formData: FormData) {
  try {
    const supabase = await createClient();
    await requireAal2(supabase);

    const files = formData.getAll('files') as File[];
    if (files.length === 0) {
      throw new Error("No documents provided for OCR.space processing.");
    }

    if (files.length > 10) {
      throw new Error("Maximum 10 documents allowed per import batch.");
    }

    const allParsedData: Array<Record<string, unknown>> = [];

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

      allParsedData.push(parsedFields as unknown as Record<string, unknown>);
    }

    if (allParsedData.length === 0) {
      throw new Error("Could not parse customer data from OCR results.");
    }

    const combinedCustomer: Record<string, unknown> = {};
    const combinedAddress: Record<string, unknown> = {};
    const combinedDocuments: Record<string, unknown> = {};

    for (const parsed of allParsedData) {
      if (parsed.customer && typeof parsed.customer === 'object') {
        Object.entries(parsed.customer as Record<string, unknown>).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            if (!combinedCustomer[k] || (typeof v === 'string' && v.length > String(combinedCustomer[k]).length)) {
              combinedCustomer[k] = v;
            }
          }
        });
      }

      if (parsed.address && typeof parsed.address === 'object') {
        Object.entries(parsed.address as Record<string, unknown>).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            const detectedDocList = parsed.detected_documents as Array<{ detected_type?: string }> | undefined;
            const detectedDocType = detectedDocList?.[0]?.detected_type || '';
            const isBack = detectedDocType.includes('back') || detectedDocType.includes('combined');
            if (isBack || !combinedAddress[k] || (typeof v === 'string' && v.length > String(combinedAddress[k]).length)) {
              combinedAddress[k] = v;
            }
          }
        });
      }

      if (parsed.documents && typeof parsed.documents === 'object') {
        Object.entries(parsed.documents as Record<string, unknown>).forEach(([k, v]) => {
          if (v && typeof v === 'object' && 'number' in v) {
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
      detected_documents: allParsedData.flatMap(d => (d.detected_documents as unknown[]) || []),
      confidence_summary: (firstParsed.confidence_summary as Record<string, unknown>) || { overall: 0.9, low_confidence_fields: [] }
    };

    return {
      success: true,
      data: combinedJson
    };

  } catch (error: unknown) {
    const err = error as Error;
    return {
      success: false,
      error: err.message || "OCR.space document extraction failed."
    };
  }
}


