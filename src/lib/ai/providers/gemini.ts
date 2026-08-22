import { BaseAIProvider, AIExtractionResult, AIProviderOptions, FileData } from './base';
import { GoogleGenAI } from '@google/genai';
import { JSONValidator } from '../parser/validator';

export class GeminiProvider extends BaseAIProvider {
  constructor() {
    super('gemini');
  }

  private getClient(): GoogleGenAI {
    return new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: {
        retryOptions: {
          attempts: 1 // 1 attempt total (0 SDK retries) — application owns retry policy
        }
      }
    });
  }

  async extractData(
    systemInstruction: string,
    prompt: string,
    files: FileData[],
    options?: AIProviderOptions
  ): Promise<AIExtractionResult> {
    const reqId = (options as any)?.reqId || 'unknown';
    const startTime = Date.now();
    const model = options?.model || 'gemini-flash-latest';
    const maxRetries = options?.maxRetries ?? 1;
    const timeoutMs = 8000; // 8 seconds per attempt max

    let attempt = 0;
    let lastError: any = null;
    let timeoutId: NodeJS.Timeout;

    let primaryAttemptMs = 0;
    let retryAttemptMs = 0;

    while (attempt <= maxRetries) {
      const attemptStart = Date.now();
      try {
        const contents = [];
        
        for (const file of files) {
          contents.push({
            inlineData: {
              data: file.base64Data,
              mimeType: file.mimeType
            }
          });
        }
        contents.push(prompt);

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            const err = new Error(`Gemini API Timeout after ${timeoutMs}ms`);
            (err as any).isTimeout = true;
            reject(err);
          }, timeoutMs);
        });

        const response = await Promise.race([
          this.getClient().models.generateContent({
            model: model,
            contents: contents,
            config: {
              systemInstruction: systemInstruction,
              temperature: options?.temperature ?? 0.0,
              responseMimeType: "application/json",
            }
          }),
          timeoutPromise
        ]) as any;
        
        clearTimeout(timeoutId!);

        const apiCallTimeMs = Date.now() - attemptStart;
        if (attempt === 0) primaryAttemptMs = apiCallTimeMs;
        else retryAttemptMs = apiCallTimeMs;

        const rawText = response.text || "{}";
        const processingTimeMs = Date.now() - startTime;
        
        const jsonParseStart = Date.now();
        let parsedJson = null;
        try {
          parsedJson = JSONValidator.cleanAndParse(rawText);
        } catch (e) {
          throw new Error("AI returned invalid JSON: " + (e as Error).message);
        }
        const jsonParseTimeMs = Date.now() - jsonParseStart;

        const inputTokens = response.usageMetadata?.promptTokenCount || 0;
        const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
        const estimatedCost = (inputTokens * 0.000000075) + (outputTokens * 0.00000030);

        return {
          rawResponse: rawText,
          parsedJson,
          status: 'success',
          processingTimeMs,
          primaryAttemptMs,
          retryAttemptMs,
          apiCallTimeMs,
          jsonParseTimeMs,
          modelName: model,
          inputTokens,
          outputTokens,
          estimatedCost
        };

      } catch (error: any) {
        clearTimeout(timeoutId!);
        lastError = error;
        const currentAttemptDuration = Date.now() - attemptStart;
        if (attempt === 0) primaryAttemptMs = currentAttemptDuration;
        else retryAttemptMs = currentAttemptDuration;
        
        const errMsg = (error?.message || "").toLowerCase();
        const isQuotaOrRateLimit = error?.status === 429 || errMsg.includes("resource_exhausted") || errMsg.includes("quota exceeded") || errMsg.includes("429");

        // Fast fail on auth, rate limit/quota, bad request, model missing or timeouts
        if (
          isQuotaOrRateLimit ||
          error?.status === 400 || 
          error?.status === 403 || 
          error?.status === 404 ||
          error?.isTimeout ||
          error?.message?.includes("API key not valid")
        ) {
           let cat = 'PROVIDER_ERROR';
           let userErrMsg = error?.message || "Gemini API failed fast.";
           if (isQuotaOrRateLimit) {
             cat = 'RATE_LIMIT';
             userErrMsg = "Gemini quota is temporarily unavailable. Please try again later.";
           } else if (error?.status === 403 || error?.message?.includes("API key")) {
             cat = 'AUTHENTICATION';
           } else if (error?.status === 404) {
             cat = 'MODEL_UNAVAILABLE';
           } else if (error?.isTimeout) {
             cat = 'TIMEOUT';
           }

           return {
             rawResponse: "",
             status: 'failed',
             processingTimeMs: Date.now() - startTime,
             primaryAttemptMs,
             retryAttemptMs,
             modelName: model,
             errorMessage: userErrMsg,
             errorCategory: cat as any
           };
        }

        attempt++;
        if (attempt <= maxRetries) {
          console.warn(`[GeminiProvider] Attempt ${attempt} failed, fast retry in 500ms...`, error.message);
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // Determine category if exhausted retries or failed
    let category: any = 'UNKNOWN';
    const errStr = (lastError?.message || "").toLowerCase();
    if (lastError?.status === 401 || lastError?.status === 403 || errStr.includes("api key") || errStr.includes("authentication")) category = 'AUTHENTICATION';
    else if (lastError?.status === 429 || errStr.includes("quota") || errStr.includes("rate limit") || errStr.includes("exhausted")) category = 'RATE_LIMIT';
    else if (lastError?.status === 404 || errStr.includes("not found") || errStr.includes("not available")) category = 'MODEL_UNAVAILABLE';
    else if (lastError?.isTimeout || errStr.includes("timeout")) category = 'TIMEOUT';
    else if (lastError?.status >= 500) category = 'PROVIDER_ERROR';
    else if (errStr.includes("fetch") || errStr.includes("network") || errStr.includes("econnrefused")) category = 'NETWORK';
    else if (errStr.includes("invalid json")) category = 'EXTRACTION_ERROR';
    else if (lastError?.status === 400) category = 'INVALID_REQUEST';

    // If we exhaust retries
    return {
      rawResponse: "",
      status: 'failed',
      processingTimeMs: Date.now() - startTime,
      modelName: model,
      errorMessage: lastError?.message || "Unknown error occurred during AI extraction",
      errorCategory: category
    };
  }
}
