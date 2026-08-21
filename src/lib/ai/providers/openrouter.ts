import { BaseAIProvider, AIExtractionResult, AIProviderOptions, FileData, AIErrorCategory } from './base';
import { JSONValidator } from '../parser/validator';

let quotaBlockedUntil = 0;
const QUOTA_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export class OpenRouterProvider extends BaseAIProvider {
  constructor() {
    super('openrouter');
  }

  async extractData(
    systemInstruction: string,
    prompt: string,
    files: FileData[],
    options?: AIProviderOptions
  ): Promise<AIExtractionResult> {
    const reqId = (options as any)?.reqId || 'unknown';
    const startTime = Date.now();
    const model = options?.model || 'openrouter/free';
    const maxRetries = options?.maxRetries || 2;
    const apiKey = process.env.OPENROUTER_API_KEY || '';

    // In-process circuit breaker check
    if (Date.now() < quotaBlockedUntil) {
      console.log(`[OpenRouter] Circuit breaker active: skipping request (quota blocked until ${new Date(quotaBlockedUntil).toISOString()})`);
      return {
        rawResponse: "",
        status: 'failed',
        processingTimeMs: Date.now() - startTime,
        modelName: model,
        errorMessage: "Backup AI provider quota is unavailable. Please try again later.",
        errorCategory: 'QUOTA'
      };
    }

    let attempt = 0;
    let lastError: any = null;

    console.log(`[OpenRouter] request_started`);
    
    if (!apiKey) {
      console.log(`[OpenRouter] missing API key, returning AUTHENTICATION error`);
      return {
        rawResponse: "",
        status: 'failed',
        processingTimeMs: Date.now() - startTime,
        modelName: model,
        errorMessage: "OpenRouter API key is missing.",
        errorCategory: 'AUTHENTICATION'
      };
    }

    const rawEnvMax = parseInt(process.env.OPENROUTER_MAX_TOKENS || '1536', 10);
    const validEnvMax = isNaN(rawEnvMax) ? 1536 : rawEnvMax;
    const maxTokens = Math.min(Math.max(validEnvMax, 512), 4096);

    while (attempt <= maxRetries) {
      try {
        const contentArray: any[] = [
          { type: "text", text: prompt }
        ];

        let hasImage = false;
        for (const file of files) {
          hasImage = true;
          contentArray.push({
            type: "image_url",
            image_url: { url: `data:${file.mimeType};base64,${file.base64Data}` }
          });
        }

        const requestBody = {
          model: model,
          messages: [
            { role: "system", content: systemInstruction },
            {
              role: "user",
              content: contentArray
            }
          ],
          response_format: { type: "json_object" },
          temperature: options?.temperature ?? 0.0,
          max_tokens: maxTokens
        };

        const apiStartTime = Date.now();
        console.log(`[AI] openrouter_fetch_start requestId=${reqId} attempt=${attempt}`);
        
        const controller = new AbortController();
        
        let response;
        let data;
        let apiCallTimeMs = 0;
        let headersMs = 0;
        let bodyMs = 0;
        let timeoutId: NodeJS.Timeout;

        try {
          const actualFetchPromise = async () => {
             const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
                "X-Title": "GCDS AI Import Engine",
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal
            });
            headersMs = Date.now() - apiStartTime;
            console.log(`[AI] openrouter_headers_received requestId=${reqId} duration=${headersMs}ms status=${res.status}`);
            
            const textData = await res.text();
            bodyMs = Date.now() - apiStartTime;
            console.log(`[AI] openrouter_body_received requestId=${reqId} duration=${bodyMs}ms size=${textData.length}`);
            
            let bodyData;
            try {
               bodyData = JSON.parse(textData);
            } catch(e) {
               bodyData = { error: { message: "Invalid JSON response from server" }, raw: textData };
            }
            
            return { res, bodyData };
          };

          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              console.log(`[AI] openrouter_timeout_fired requestId=${reqId}`);
              controller.abort();
              const err = new Error("AbortError: fetch timed out after 15 seconds");
              err.name = "AbortError";
              reject(err);
            }, 15000);
          });

          const result = await Promise.race([actualFetchPromise(), timeoutPromise]) as any;
          
          // Clear timeout so we don't have dangling timers!
          clearTimeout(timeoutId!);

          response = result.res;
          data = result.bodyData;
          apiCallTimeMs = Date.now() - apiStartTime;

          if (!response.ok) {
            throw {
              status: response.status,
              message: data.error?.message || `HTTP ${response.status}: ${response.statusText}`,
              errorData: data
            };
          }
        } catch (err: any) {
          clearTimeout(timeoutId!); // Ensure cleared on error
          throw err;
        }

        const actualModel = data.model || model;
        
        const rawText = data.choices?.[0]?.message?.content || "{}";
        const processingTimeMs = Date.now() - startTime;

        const jsonParseStart = Date.now();
        let parsedJson = null;
        try {
          parsedJson = JSONValidator.cleanAndParse(rawText);
        } catch (e) {
          throw new Error("AI returned invalid JSON: " + (e as Error).message);
        }
        
        const jsonParseTimeMs = Date.now() - jsonParseStart;
        console.log(`[AI] openrouter_result requestId=${reqId} status=success parsed=${!!parsedJson}`);

        const inputTokens = data.usage?.prompt_tokens || 0;
        const outputTokens = data.usage?.completion_tokens || 0;
        const estimatedCost = data.usage?.total_cost || 0; 

        return {
          rawResponse: rawText,
          parsedJson,
          status: 'success',
          processingTimeMs,
          apiCallTimeMs,
          jsonParseTimeMs,
          modelName: actualModel,
          inputTokens,
          outputTokens,
          estimatedCost
        };

      } catch (error: any) {
        lastError = error;

        if (error.name === 'AbortError' || error.message?.includes('abort')) {
          lastError.isTimeout = true;
          break; // Do not retry on timeout
        }

        attempt++;
        if (attempt <= maxRetries && error.status && (error.status === 429 || error.status >= 500)) {
          console.warn(`[OpenRouterProvider] Attempt ${attempt} failed with ${error.status}, retrying...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        } else {
          break; // Don't retry auth, 402, or bad request errors
        }
      }
    }

    let category: AIErrorCategory = 'UNKNOWN';
    const errStr = (lastError?.message || "").toLowerCase();
    
    if (lastError?.isTimeout || lastError?.name === 'AbortError' || errStr.includes("abort")) category = 'TIMEOUT';
    else if (lastError?.status === 402 || lastError?.status === 429 || errStr.includes("rate limit") || errStr.includes("quota") || errStr.includes("credits") || errStr.includes("insufficient") || errStr.includes("max_tokens")) category = 'QUOTA';
    else if (lastError?.status === 401 || lastError?.status === 403 || errStr.includes("unauthorized") || errStr.includes("invalid key") || errStr.includes("missing key") || errStr.includes("api key")) category = 'AUTHENTICATION';
    else if (lastError?.status === 404 || errStr.includes("model")) category = 'MODEL_UNAVAILABLE';
    else if (lastError?.status >= 500) category = 'PROVIDER_ERROR';
    else if (errStr.includes("fetch") || errStr.includes("network") || errStr.includes("failed to fetch")) category = 'NETWORK';
    else if (errStr.includes("invalid json") || errStr.includes("JSON")) category = 'EXTRACTION_ERROR';
    else if (lastError?.status === 400) category = 'INVALID_REQUEST';

    let finalErrorMessage = "Unknown error occurred during AI extraction";
    
    if (category === 'TIMEOUT') {
      finalErrorMessage = "AI service is temporarily unavailable. Please try again.";
    } else if (category === 'QUOTA' || lastError?.status === 402) {
      finalErrorMessage = "Backup AI provider quota is unavailable. Please try again later.";
      // Trip circuit breaker for 5 minutes on HTTP 402 / QUOTA failure
      quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
    } else if (lastError?.status) {
      finalErrorMessage = `AI Fallback HTTP Error ${lastError.status}: ${lastError.message}`;
    } else if (lastError?.message) {
      finalErrorMessage = lastError.message;
    }

    console.log(`[AI] openrouter_result requestId=${reqId} status=failed category=${category}`);
    console.log(`[OpenRouter] Returning failure: category=${category}, message=${finalErrorMessage}`);

    return {
      rawResponse: "",
      status: 'failed',
      processingTimeMs: Date.now() - startTime,
      modelName: model,
      errorMessage: finalErrorMessage,
      errorCategory: category
    };
  }
}

