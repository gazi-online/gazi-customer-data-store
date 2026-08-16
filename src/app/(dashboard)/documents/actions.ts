"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { AIProviderRegistry } from "@/lib/ai/providers";
import { PromptManager } from "@/lib/ai/prompts/PromptManager";
import { ExtractionCache } from "@/lib/ai/cache/ExtractionCache";
import { v4 as uuidv4 } from "uuid";

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File;
  const customerId = formData.get("customer_id") as string;
  const documentType = formData.get("document_type") as string;
  const side = (formData.get("side") as string) || "single";
  
  if (!file || !customerId || !documentType) {
    return { error: "Missing required fields" };
  }

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    return { error: "File size exceeds 10MB limit" };
  }

  const { data: { user } } = await supabase.auth.getUser();

  const fileExt = file.name.split('.').pop();
  const fileName = `${customerId}/${documentType.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`;

  // Upload to Supabase Private Storage
  const { error: uploadError } = await supabase.storage
    .from("customer_documents")
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) return { error: uploadError.message };

  // Insert into DB with audit fields
  const { error: dbError } = await supabase
    .from("customer_documents")
    .insert([{
      customer_id: customerId,
      document_type: documentType,
      file_url: fileName,
      side: side,
      source_filename: file.name,
      file_size: file.size,
      mime_type: file.type,
      created_by: user?.id || null,
      status: 'active',
      version: 1,
      ai_processed: false,
      verified: false
    }]);

  if (dbError) return { error: dbError.message };

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function replaceDocument(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File;
  const customerId = formData.get("customer_id") as string;
  const oldDocumentId = formData.get("old_document_id") as string;
  const documentType = formData.get("document_type") as string;

  if (!file || !customerId || !oldDocumentId || !documentType) {
    return { error: "Missing required fields for replacement" };
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch old document version
  const { data: oldDoc } = await supabase
    .from("customer_documents")
    .select("version, side")
    .eq("id", oldDocumentId)
    .single();

  const newVersion = (oldDoc?.version || 1) + 1;
  const side = oldDoc?.side || "single";

  const fileExt = file.name.split('.').pop();
  const fileName = `${customerId}/${documentType.replace(/\s+/g, '_')}_v${newVersion}_${Date.now()}.${fileExt}`;

  // Upload new file version to Private Storage
  const { error: uploadError } = await supabase.storage
    .from("customer_documents")
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) return { error: uploadError.message };

  // Insert new document version
  const { data: newDoc, error: insertError } = await supabase
    .from("customer_documents")
    .insert([{
      customer_id: customerId,
      document_type: documentType,
      file_url: fileName,
      side: side,
      source_filename: file.name,
      file_size: file.size,
      mime_type: file.type,
      created_by: user?.id || null,
      status: 'active',
      version: newVersion,
      ai_processed: false,
      verified: false
    }])
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  // Mark old document as superseded by newDoc.id
  await supabase
    .from("customer_documents")
    .update({
      status: 'superseded',
      superseded_by: newDoc.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", oldDocumentId);

  revalidatePath(`/customers/${customerId}`);
  return { success: true, newDocumentId: newDoc.id };
}

export async function archiveDocument(documentId: string, customerId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("customer_documents")
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", documentId);

  if (error) return { error: error.message };

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function getCustomerDocuments(customerId: string, includeHistory = false) {
  const supabase = await createClient();
  let query = supabase
    .from("customer_documents")
    .select("*")
    .eq("customer_id", customerId);

  if (!includeHistory) {
    query = query.eq("status", "active");
  }

  const { data: documents, error } = await query.order("uploaded_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Generate signed URLs for preview securely
  const docsWithUrls = await Promise.all(
    documents.map(async (doc) => {
      const { data } = await supabase.storage
        .from("customer_documents")
        .createSignedUrl(doc.file_url, 60 * 60); // 1 hour expiry
        
      return {
        ...doc,
        signed_url: data?.signedUrl
      };
    })
  );

  return docsWithUrls;
}

export async function getCustomerAiImports(customerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_import_history")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[getCustomerAiImports] Warning:", error.message);
    return [];
  }

  return data || [];
}

export async function rerunExtraction(documentId: string, customerId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: doc, error: docErr } = await supabase
    .from("customer_documents")
    .select("*")
    .eq("id", documentId)
    .single();

  if (docErr || !doc) return { error: "Document not found" };

  // Download document buffer from storage
  const { data: fileBuffer, error: dlErr } = await supabase.storage
    .from("customer_documents")
    .download(doc.file_url);

  if (dlErr || !fileBuffer) return { error: "Failed to download document file for AI re-run" };

  const buffer = await fileBuffer.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = doc.mime_type || 'image/png';

  const providerName = process.env.DEFAULT_AI_PROVIDER || 'gemini';
  const promptVersion = process.env.PROMPT_VERSION || 'v1';
  const modelName = 'gemini-flash-latest';

  const finalPrompt = PromptManager.generateFinalPrompt({
    provider: providerName as any,
    version: promptVersion as any,
    documentTypes: [doc.document_type]
  });

  const fileDataArray = [{ base64Data: base64, mimeType }];
  const requestHash = ExtractionCache.computeRequestHash({
    files: fileDataArray,
    documentTypes: [doc.document_type],
    promptVersion,
    modelName
  });

  // Check Extraction Cache
  const cacheRes = await ExtractionCache.lookupCache(supabase, user.id, requestHash);
  let extractionResult: any = null;
  let cacheHit = cacheRes.hit;

  if (cacheHit && cacheRes.resultJson) {
    extractionResult = {
      status: 'success',
      parsedJson: cacheRes.resultJson,
      modelName,
      processingTimeMs: cacheRes.lookupMs,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0
    };
  } else {
    const provider = AIProviderRegistry.getProvider(providerName);
    extractionResult = await provider.extractData(
      "You are a highly accurate Document Extraction AI.",
      finalPrompt,
      fileDataArray
    );

    if (extractionResult.status === 'success' && extractionResult.parsedJson) {
      await ExtractionCache.saveCache(supabase, {
        requestHash,
        userId: user.id,
        provider: providerName,
        modelName: extractionResult.modelName || modelName,
        promptVersion,
        resultJson: extractionResult.parsedJson
      });
    }
  }

  // Create NEW AI Import History record linked to customer_id & document_ids
  const { data: newHistory, error: histErr } = await supabase
    .from("ai_import_history")
    .insert([{
      created_by: user.id,
      customer_id: customerId,
      document_ids: [documentId],
      original_images: JSON.stringify([doc.source_filename || doc.document_type]),
      ai_raw_response: "[REDACTED FOR PRIVACY]",
      final_json: extractionResult.parsedJson || null,
      ai_provider: providerName,
      prompt_version: promptVersion,
      status: extractionResult.status,
      processing_time_ms: extractionResult.processingTimeMs || 0,
      input_tokens: extractionResult.inputTokens || 0,
      output_tokens: extractionResult.outputTokens || 0,
      estimated_cost: extractionResult.estimatedCost || 0,
      model_name: extractionResult.modelName || modelName,
      cache_hit: cacheHit,
      error_message: extractionResult.errorMessage || null
    }])
    .select("id")
    .single();

  if (histErr) console.error("[rerunExtraction] Error logging history:", histErr.message);

  revalidatePath(`/customers/${customerId}`);
  return {
    success: true,
    data: extractionResult.parsedJson,
    historyId: newHistory?.id,
    cacheHit
  };
}

export async function deleteDocument(documentId: string, fileUrl: string, customerId: string) {
  const supabase = await createClient();
  
  // Soft delete / Archive by default to preserve audit evidence
  const { error } = await supabase
    .from("customer_documents")
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", documentId);
  
  if (error) return { error: error.message };
  
  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}
