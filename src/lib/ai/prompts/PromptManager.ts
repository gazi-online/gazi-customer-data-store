import * as fs from 'fs';
import * as path from 'path';

export type AiProvider = 'gemini' | 'openai' | 'claude';
export type PromptVersion = 'v1';

export interface PromptManagerOptions {
  provider: AiProvider;
  version?: PromptVersion;
  documentTypes: string[];
}

export class PromptManager {
  private static getBaseDir() {
    return path.join(process.cwd(), 'src', 'lib', 'ai', 'prompts');
  }

  private static readFile(version: string, filename: string): string {
    const filePath = path.join(this.getBaseDir(), version, filename);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.warn(`[PromptManager] Could not find file: ${filePath}`);
      return '';
    }
  }

  private static getDocumentPrompts(documentTypes: string[]): string {
    let basePrompt = `AUTOMATIC DOCUMENT TYPE DETECTION (CRITICAL):
- Inspect the visual and text content of each provided image/file/page to automatically classify its document type into the 'detected_documents' array in JSON.
- Detection must be derived strictly from document title, issuing authority, field labels, layout, and visual identifiers (e.g. Government of India, UIDAI, Income Tax Department, Election Commission of India, State Food & Supplies Dept, Bank Seal/Header, etc.). NEVER classify solely based on filename or file extension.
- Taxonomy options: 'aadhaar_front', 'aadhaar_back', 'aadhaar_combined', 'pan_card', 'voter_id', 'ration_card', 'bank_passbook', 'bank_statement', 'cancelled_cheque', 'passport', 'driving_licence', 'generic_identity_document', 'generic_address_document', 'unknown'.
- If a document cannot be confidently classified, set detected_type = 'unknown'. Do NOT fabricate a document type.
- All uploaded documents belong to the SAME customer. Extract and merge their information into the unified customer schema.`;

    if (documentTypes && documentTypes.length > 0) {
      basePrompt += `\n\nDocuments provided for this extraction context: ${documentTypes.join(', ')}.`;
    }
    
    basePrompt += `\n\nRELATIONSHIP MAPPING RULES (CRITICAL):
- "S/O", "D/O" → Extract the name into 'father_name'.
- "C/O" → Extract into 'father_name' ONLY if the document explicitly identifies the relationship as father/guardian. Do NOT automatically map C/O to father_name. If ambiguous, preserve it as a conflict/uncertain relationship.
- "W/O", "H/O", "Wife of", "Husband of", "Husband", "Wife", "Spouse" → Extract the name into 'spouse_name' AND set 'marital_status' = "Married".
- NEVER infer marital status from gender. Do NOT treat an arbitrary value in spouse_name as sufficient evidence for marital_status. The relationship token/context (W/O, H/O, etc.) must be explicitly detected.
- If there is no explicit spouse relationship, 'marital_status' should remain null. Do NOT automatically set Unmarried.
- Never put a spouse name into 'father_name' merely because the customer is female.
- If the exact relationship is not explicitly visible, return null for these fields.`;

    if (documentTypes.includes('Aadhaar Front') && documentTypes.includes('Aadhaar Back')) {
      basePrompt += '\n\nSPECIAL INSTRUCTION: You have been provided with both the Front and Back sides of an Aadhaar card. Treat them as ONE logical document. Please extract information from BOTH images and MERGE them into a single comprehensive JSON object.\n- Address: If the Back side contains address information, PREFER the Back side for address, city, district, state, pincode, country. Do NOT use a partial address from the Front side when the Back side contains a more complete address.\n- Conflicts: If the same field appears on both sides, compare the values. If identical, keep one. If different, create a conflict for the Review Panel. Never silently overwrite one value with another.\n- Metadata: Preserve source metadata at field level: source_document, source_side (must be "front", "back", or "unknown"), and confidence.';
    }

    basePrompt += `\n\nNAME EXTRACTION RULES (CRITICAL):
1. FULL NAME: The complete name visible on the document must always be extracted into \`full_name\`. Never lose \`full_name\`, even if first/middle/last splitting fails.
2. ORIGINAL LANGUAGE NAME: If the name appears in a non-Latin/original script, preserve it exactly as displayed in \`original_language_name\`. Do not translate it. Do not transliterate it unless another explicit field requires it.
3. FIRST / MIDDLE / LAST: Only populate these fields when the document provides enough evidence to identify the components reliably. Do NOT split a name merely because spaces exist. For example, for "Reshma Khatun", do NOT automatically assume first_name = Reshma and last_name = Khatun unless the document structure supports it. If uncertain, set first_name = null, middle_name = null, last_name = null, and keep full_name = "Reshma Khatun".
4. If the document clearly indicates First Name / Middle Name / Last Name, then populate those fields.
5. RELATIONSHIP TEXT MUST NOT BECOME PART OF CUSTOMER NAME. Examples: "RAHUL KUMAR S/O RAM KUMAR" → full_name = "RAHUL KUMAR", father_name = "RAM KUMAR". "PRIYA SHARMA W/O AMIT SHARMA" → full_name = "PRIYA SHARMA", spouse_name = "AMIT SHARMA". Do not include S/O, D/O, W/O, H/O or relationship labels inside full_name.
6. DO NOT USE FATHER / SPOUSE NAME TO COMPLETE CUSTOMER NAME.
7. DO NOT GUESS.`;

    basePrompt += `\n\nLOCATION EXTRACTION RULES (CRITICAL):
- Country: Default country = "India" when no contradictory document information exists.
- District: For Aadhaar Front + Back, prefer district extracted from Aadhaar Back. Do not infer district from city/state. If unavailable, return null.`;

    basePrompt += `\n\nPROFILE PHOTO EXTRACTION (CRITICAL):
- Identify the actual face/portrait region of the person.
- Return a bounding box tightly around the person's face.
- Format MUST be [ymin, xmin, ymax, xmax] scaled to 1000 (values between 0 and 1000 representing normalized coordinates).
- Do not treat clothing, background, signature, QR code, or document graphics as a portrait.
- If no reliable face/portrait is detected, set available to false and bounding_box to null.
- Set source_document and source_side metadata accurately.`;
    
    return basePrompt;
  }

  private static applyProviderTweaks(prompt: string, provider: AiProvider): string {
    switch (provider) {
      case 'gemini':
        // Gemini often needs a very explicit JSON block command at the end
        return prompt + '\n\nIMPORTANT: Wrap your final output in a ```json ... ``` codeblock.';
      case 'openai':
        // OpenAI functions best when told to act as a strict JSON API
        return prompt + '\n\nYou must respond ONLY with valid JSON. Do not include any conversational text or explanations.';
      case 'claude':
        // Claude likes seeing <json> tags or explicit format instructions
        return prompt + '\n\nOutput only the raw JSON. Do not include introductory or concluding remarks.';
      default:
        return prompt;
    }
  }

  public static generateFinalPrompt(options: PromptManagerOptions): string {
    const version = options.version || 'v1';

    const masterPrompt = this.readFile(version, 'master.txt');
    const mergeRules = this.readFile(version, 'merge-rules.txt');
    const conflictRules = this.readFile(version, 'conflict-rules.txt');
    const schema = this.readFile(version, 'schema.json');
    const docPrompt = this.getDocumentPrompts(options.documentTypes);

    const parts = [
      masterPrompt,
      '---',
      docPrompt,
      '---',
      mergeRules,
      '---',
      conflictRules,
      '---',
      'EXPECTED JSON SCHEMA:',
      schema
    ].filter(p => p.trim() !== '');

    const combinedPrompt = parts.join('\n\n');

    return this.applyProviderTweaks(combinedPrompt, options.provider);
  }
}
