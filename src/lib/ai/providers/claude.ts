import { BaseAIProvider, AIExtractionResult, AIProviderOptions, FileData } from './base';
import { JSONValidator } from '../parser/validator';

export class ClaudeProvider extends BaseAIProvider {
  constructor() {
    super('claude');
  }

  async extractData(
    systemInstruction: string,
    prompt: string,
    files: FileData[],
    options?: AIProviderOptions
  ): Promise<AIExtractionResult> {
    const startTime = Date.now();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = options?.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

    if (!apiKey || apiKey.trim().length === 0) {
      return {
        rawResponse: '',
        status: 'failed',
        processingTimeMs: Date.now() - startTime,
        modelName: model,
        errorMessage: 'Claude API key not configured (ANTHROPIC_API_KEY is missing).',
        errorCategory: 'AUTHENTICATION'
      };
    }

    try {
      const content: any[] = [];

      for (const file of files) {
        if (file.mimeType === 'application/pdf') {
          content.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: file.base64Data
            }
          });
        } else if (file.mimeType.startsWith('image/')) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.mimeType,
              data: file.base64Data
            }
          });
        }
      }

      content.push({ type: 'text', text: prompt });

      const requestBody = {
        model,
        max_tokens: 4096,
        temperature: options?.temperature ?? 0.0,
        system: systemInstruction,
        messages: [
          { role: 'user', content }
        ]
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseTimeMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        let category: any = 'PROVIDER_ERROR';
        if (response.status === 401 || response.status === 403) category = 'AUTHENTICATION';
        else if (response.status === 429) category = 'RATE_LIMIT';

        return {
          rawResponse: errorText,
          status: 'failed',
          processingTimeMs: responseTimeMs,
          modelName: model,
          errorMessage: `Claude API returned HTTP ${response.status}: ${errorText.substring(0, 200)}`,
          errorCategory: category
        };
      }

      const resData = await response.json();
      const rawText = resData.content?.[0]?.text || '{}';

      const jsonParseStart = Date.now();
      let parsedJson = null;
      try {
        parsedJson = JSONValidator.cleanAndParse(rawText);
      } catch (e) {
        throw new Error("Claude returned invalid JSON: " + (e as Error).message);
      }
      const jsonParseTimeMs = Date.now() - jsonParseStart;

      const inputTokens = resData.usage?.input_tokens || 0;
      const outputTokens = resData.usage?.output_tokens || 0;
      const estimatedCost = (inputTokens * 0.000003) + (outputTokens * 0.000015);

      return {
        rawResponse: rawText,
        parsedJson,
        status: 'success',
        processingTimeMs: Date.now() - startTime,
        apiCallTimeMs: responseTimeMs,
        jsonParseTimeMs,
        modelName: model,
        inputTokens,
        outputTokens,
        estimatedCost
      };

    } catch (error: any) {
      return {
        rawResponse: '',
        status: 'failed',
        processingTimeMs: Date.now() - startTime,
        modelName: model,
        errorMessage: error.message || 'Claude document extraction failed.',
        errorCategory: 'PROVIDER_ERROR'
      };
    }
  }
}
