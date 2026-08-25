import crypto from 'crypto';

// Simulation of private Supabase Storage and Customer Documents DB
class MockStorageService {
  private storage: Map<string, { buffer: Buffer; contentType: string }> = new Map();

  async upload(path: string, buffer: Buffer, contentType: string) {
    if (this.storage.has(path)) {
      throw new Error("File already exists at this path");
    }
    this.storage.set(path, { buffer, contentType });
    return { path };
  }

  async createSignedUrl(path: string, expiresInSeconds = 900) {
    if (!this.storage.has(path)) {
      return { data: null, error: { message: "Object not found" } };
    }
    // Return a short-lived tokenized URL
    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    return {
      data: {
        signedUrl: `https://mock.supabase.co/storage/v1/object/sign/customer_documents/${path}?token=${token}&exp=${expiresAt}`
      },
      error: null
    };
  }

  async remove(paths: string[]) {
    paths.forEach(p => this.storage.delete(p));
    return { data: paths, error: null };
  }

  hasFile(path: string) {
    return this.storage.has(path);
  }
}

class MockDocumentsDatabase {
  public customers: any[] = [
    { id: "cust_111", customer_code: "CUST-001", first_name: "Reshma", last_name: "Khatun", phone: "9876543210" },
    { id: "cust_222", customer_code: "CUST-002", first_name: "Abdul", last_name: "Karim", phone: "9811122233" }
  ];

  public customerDocuments: any[] = [];
  public storageService = new MockStorageService();

  private ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  private MAX_SIZE = 10 * 1024 * 1024;

  async uploadCustomerDocument(params: {
    customerId: string;
    documentType: string;
    documentName?: string;
    documentNumber?: string;
    filename: string;
    fileBuffer: Buffer;
    mimeType: string;
    userId?: string;
  }) {
    if (!params.customerId || !params.documentType || !params.filename) {
      return { error: "Missing required fields" };
    }

    if (!params.fileBuffer || params.fileBuffer.length === 0) {
      return { error: "Uploaded file is empty" };
    }

    if (params.fileBuffer.length > this.MAX_SIZE) {
      return { error: "File size exceeds 10MB limit" };
    }

    if (!this.ALLOWED_MIMES.includes(params.mimeType)) {
      return { error: `Unsupported file format (${params.mimeType}). Allowed: JPG, PNG, WEBP, PDF` };
    }

    const customer = this.customers.find(c => c.id === params.customerId);
    if (!customer) {
      return { error: "Invalid customer ID. Customer not found." };
    }

    // Collision-safe private path (Never expose Aadhaar/PAN in path)
    const sanitizedName = params.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `customers/${params.customerId}/${crypto.randomUUID()}-${sanitizedName}`;

    await this.storageService.upload(storagePath, params.fileBuffer, params.mimeType);

    const doc = {
      id: "doc_" + crypto.randomUUID().slice(0, 8),
      customer_id: params.customerId,
      document_type: params.documentType,
      document_name: params.documentName || null,
      document_number: params.documentNumber || null,
      file_url: storagePath,
      source_filename: params.filename,
      file_size: params.fileBuffer.length,
      mime_type: params.mimeType,
      created_by: params.userId || "user_admin",
      status: "active",
      version: 1,
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.customerDocuments.push(doc);
    return { success: true, document: doc };
  }

  async getAllDocuments(filter?: { search?: string; documentType?: string; status?: string }) {
    let docs = [...this.customerDocuments];

    if (filter?.status && filter.status !== "all") {
      docs = docs.filter(d => d.status === filter.status);
    }

    if (filter?.documentType && filter.documentType !== "all") {
      docs = docs.filter(d => d.document_type === filter.documentType);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      docs = docs.filter(d => {
        const cust = this.customers.find(c => c.id === d.customer_id);
        const name = cust ? `${cust.first_name} ${cust.last_name}`.toLowerCase() : "";
        const code = cust ? cust.customer_code.toLowerCase() : "";
        return name.includes(q) || code.includes(q) || d.document_type.toLowerCase().includes(q) || d.source_filename.toLowerCase().includes(q);
      });
    }

    // Attach short-lived signed URLs
    const docsWithUrls = await Promise.all(
      docs.map(async (doc) => {
        const { data } = await this.storageService.createSignedUrl(doc.file_url, 900);
        const customer = this.customers.find(c => c.id === doc.customer_id);
        return {
          ...doc,
          customer,
          signed_url: data?.signedUrl || ""
        };
      })
    );

    return {
      documents: docsWithUrls,
      total: docsWithUrls.length
    };
  }

  async getCustomerDocuments(customerId: string) {
    const docs = this.customerDocuments.filter(d => d.customer_id === customerId && d.status === "active");
    return await Promise.all(
      docs.map(async (doc) => {
        const { data } = await this.storageService.createSignedUrl(doc.file_url, 900);
        return {
          ...doc,
          signed_url: data?.signedUrl || ""
        };
      })
    );
  }

  async deleteDocument(documentId: string, hardDelete = true) {
    const docIndex = this.customerDocuments.findIndex(d => d.id === documentId);
    if (docIndex === -1) return { error: "Document not found" };

    const doc = this.customerDocuments[docIndex];
    if (hardDelete) {
      await this.storageService.remove([doc.file_url]);
      this.customerDocuments.splice(docIndex, 1);
    } else {
      doc.status = "archived";
      doc.archived_at = new Date().toISOString();
    }
    return { success: true };
  }
}

async function runDocumentsModuleTestSuite() {
  console.log("==========================================================================");
  console.log("📁 DOCUMENTS MODULE (PHASE 5) TEST SUITE");
  console.log("==========================================================================\n");

  const db = new MockDocumentsDatabase();
  let passCount = 0;
  let failCount = 0;

  function report(name: string, condition: boolean, details?: any) {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passCount++;
    } else {
      console.error(`❌ [FAIL] ${name}`, details || "");
      failCount++;
    }
  }

  // --- A. Valid JPG Upload ---
  const jpgRes = await db.uploadCustomerDocument({
    customerId: "cust_111",
    documentType: "Aadhaar Card (Front)",
    filename: "my_aadhaar_front.jpg",
    fileBuffer: Buffer.from("fake-jpg-content"),
    mimeType: "image/jpeg"
  });
  report("A: Valid JPG upload succeeds", jpgRes.success === true && !!jpgRes.document);

  // --- B. Valid PDF Upload ---
  const pdfRes = await db.uploadCustomerDocument({
    customerId: "cust_111",
    documentType: "Trade License",
    filename: "trade_license_2026.pdf",
    fileBuffer: Buffer.from("%PDF-1.4 fake pdf data"),
    mimeType: "application/pdf"
  });
  report("B: Valid PDF upload succeeds", pdfRes.success === true && !!pdfRes.document);

  // --- C. Unsupported MIME rejected ---
  const exeRes = await db.uploadCustomerDocument({
    customerId: "cust_111",
    documentType: "Other",
    filename: "malware.exe",
    fileBuffer: Buffer.from("MZ fake executable"),
    mimeType: "application/x-msdownload"
  });
  report("C: Unsupported MIME (executable) rejected", !!exeRes.error);

  const htmlRes = await db.uploadCustomerDocument({
    customerId: "cust_111",
    documentType: "Other",
    filename: "phishing.html",
    fileBuffer: Buffer.from("<html>script</html>"),
    mimeType: "text/html"
  });
  report("C2: Unsupported MIME (HTML) rejected", !!htmlRes.error);

  // --- D. Customer required & validated ---
  const invalidCustRes = await db.uploadCustomerDocument({
    customerId: "non_existent_customer",
    documentType: "PAN Card",
    filename: "pan.png",
    fileBuffer: Buffer.from("fake png"),
    mimeType: "image/png"
  });
  report("D: Non-existent customer ID rejected", !!invalidCustRes.error);

  // --- E. Metadata created ---
  const panRes = await db.uploadCustomerDocument({
    customerId: "cust_222",
    documentType: "PAN Card",
    documentName: "Business PAN",
    documentNumber: "ABCDE1234F",
    filename: "pan_card.png",
    fileBuffer: Buffer.from("fake pan data"),
    mimeType: "image/png"
  });
  report("E: Metadata created with document_name and document_number", panRes.document?.document_name === "Business PAN" && panRes.document?.document_number === "ABCDE1234F");

  // --- F. Unique storage path ---
  report("F: Unique storage paths generated", jpgRes.document?.file_url !== pdfRes.document?.file_url);

  // --- G. Signed URL generated ---
  const signedRes = await db.storageService.createSignedUrl(jpgRes.document!.file_url, 900);
  report("G: Short-lived signed URL generated", Boolean(signedRes.data?.signedUrl.includes("/customer_documents/") && signedRes.data?.signedUrl.includes("token=")));

  // --- H. Public URL not used ---
  report("H: Public URL never exposed as storage path", !jpgRes.document?.file_url.startsWith("http://") && !jpgRes.document?.file_url.startsWith("https://"));

  // --- I. Customer-specific listing ---
  const cust111Docs = await db.getCustomerDocuments("cust_111");
  report("I: Customer-specific listing returns only matching customer docs", cust111Docs.length === 2 && cust111Docs.every(d => d.customer_id === "cust_111"));

  // --- J. Global listing ---
  const globalDocs = await db.getAllDocuments();
  report("J: Global listing returns documents across all customers", globalDocs.documents.length === 3 && globalDocs.total === 3);

  // --- K. Document type filter ---
  const panDocs = await db.getAllDocuments({ documentType: "PAN Card" });
  report("K: Document type filter returns only PAN Card", panDocs.documents.length === 1 && panDocs.documents[0].document_type === "PAN Card");

  // --- L. Delete removes correct metadata/object ---
  const docToDelete = panRes.document!;
  const deleteRes = await db.deleteDocument(docToDelete.id, true);
  report("L: Delete removes metadata record", deleteRes.success === true && !db.customerDocuments.some(d => d.id === docToDelete.id));
  report("L2: Delete removes object from storage", !db.storageService.hasFile(docToDelete.file_url));

  // --- M. Another customer's object not accidentally deleted ---
  report("M: Other customer's storage object remains intact", db.storageService.hasFile(jpgRes.document!.file_url));

  // --- N. Missing document handled cleanly ---
  const missingDeleteRes = await db.deleteDocument("ghost_doc_id", true);
  report("N: Missing document delete handled cleanly without crash", !!missingDeleteRes.error);

  // --- O. Aadhaar number not present in storage path ---
  const aadhaarUpload = await db.uploadCustomerDocument({
    customerId: "cust_111",
    documentType: "Aadhaar Card (Front)",
    documentNumber: "123456789012",
    filename: "aadhaar_scan.jpg",
    fileBuffer: Buffer.from("fake aadhaar"),
    mimeType: "image/jpeg"
  });
  report("O: Storage path does NOT expose Aadhaar number", !aadhaarUpload.document?.file_url.includes("123456789012"));

  // --- P. Unsupported / Empty file rejected ---
  const emptyRes = await db.uploadCustomerDocument({
    customerId: "cust_111",
    documentType: "Passport",
    filename: "empty.jpg",
    fileBuffer: Buffer.alloc(0),
    mimeType: "image/jpeg"
  });
  report("P: Empty file rejected", !!emptyRes.error);

  console.log("\n==========================================================================");
  console.log(`DOCUMENTS MODULE TEST RESULT: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("==========================================================================\n");

  if (failCount > 0) process.exit(1);
}

runDocumentsModuleTestSuite().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
