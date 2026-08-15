export class JSONValidator {
  /**
   * Cleans AI response by removing Markdown formatting (like ```json ... ```)
   * and any leading/trailing text to extract just the JSON.
   */
  static cleanAndParse(rawText: string): any {
    let cleaned = rawText.trim();
    
    // Remove markdown code blocks if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '');
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/\s*```$/, '');
    }
    
    // Find the first { and the last } in case AI prepended/appended conversational text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    
    try {
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("[JSONValidator] Failed to parse JSON:", cleaned.substring(0, 100) + "...");
      throw new Error("Invalid JSON format from AI");
    }
  }
}
