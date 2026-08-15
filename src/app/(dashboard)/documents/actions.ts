"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function uploadDocument(formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File;
  const customerId = formData.get("customer_id") as string;
  const documentType = formData.get("document_type") as string;
  
  if (!file || !customerId || !documentType) {
    return { error: "Missing required fields" };
  }

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    return { error: "File size exceeds 10MB limit" };
  }

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

  // Insert into DB
  const { error: dbError } = await supabase
    .from("customer_documents")
    .insert([{
      customer_id: customerId,
      document_type: documentType,
      file_url: fileName,
      ai_processed: false,
      verified: false
    }]);

  if (dbError) return { error: dbError.message };

  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}

export async function getCustomerDocuments(customerId: string) {
  const supabase = await createClient();
  const { data: documents, error } = await supabase
    .from("customer_documents")
    .select("*")
    .eq("customer_id", customerId)
    .order("uploaded_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Generate signed URLs for preview
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

export async function deleteDocument(documentId: string, fileUrl: string, customerId: string) {
  const supabase = await createClient();
  
  // Delete from Storage
  await supabase.storage.from("customer_documents").remove([fileUrl]);
  
  // Delete from DB
  const { error } = await supabase.from("customer_documents").delete().eq("id", documentId);
  
  if (error) return { error: error.message };
  
  revalidatePath(`/customers/${customerId}`);
  return { success: true };
}
