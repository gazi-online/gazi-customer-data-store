import { BaseAIProvider, AIExtractionResult, AIProviderOptions, FileData } from './base';
import { JSONValidator } from '../parser/validator';

export class OpenAIProvider extends BaseAIProvider {
  constructor() {
    super('openai');
  }

  async extractData(
    systemInstruction: string,
    prompt: string,
    files: FileData[],
    options?: AIProviderOptions
  ): Promise<AIExtractionResult> {
    const startTime = Date.now();
    const apiKey = process.env.OPENAI_API_KEY;
    const model = options?.model || process.env.OPENAI_MODEL || 'gpt-4o';

    if (!apiKey || apiKey.trim().length === 0) {
      return {
        rawResponse: '',
        status: 'failed',
        processingTimeMs: Date.now() - startTime,
        modelName: model,
        errorMessage: 'OpenAI API key not configured (OPENAI_API_KEY is missing).',
        errorCategory: 'AUTHENTICATION'
      };
    }

    try {
      const userContent: any[] = [{ type: 'text', text: prompt }];

      for (const file of files) {
        if (file.mimeType.startsWith('image/')) {
          userContent.push({
            type: 'image_url',
            image_url: {
              url: `data:${file.mimeType};base64,${file.base64Data}`
            }
          });
        } else if (file.mimeType === 'application/pdf') {
          // Send PDF info or image data URL
          userContent.push({
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${file.base64Data}`
            }
          });
        }
      }

      const requestBody = {
        model,
        temperature: options?.temperature ?? 0.0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent }
        ]
      };

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const responseTimeMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        let category: any = 'PROVIDER_ERROR';
        if (response.status === 401 || response.status === 403) category = 'AUTHENTICATION';
        else if (response.status === 429) category = 'RATE_LIMIT';
        else if (response.status === 404) category = 'MODEL_UNAVAILABLE';

        return {
          rawResponse: errorText,
          status: 'failed',
          processingTimeMs: responseTimeMs,
          modelName: model,
          errorMessage: `OpenAI API returned HTTP ${response.status}: ${errorText.substring(0, 200)}`,
          errorCategory: category
        };
      }

      const resData = await response.json();
      const rawText = resData.choices?.[0]?.message?.content || '{}';
      
      const jsonParseStart = Date.now();
      let parsedJson = null;
      try {
        parsedJson = JSONValidator.cleanAndParse(rawText);
      } catch (e) {
        throw new Error("OpenAI returned invalid JSON: " + (e as Error).message);
      }
      const jsonParseTimeMs = Date.now() - jsonParseStart;

      const inputTokens = resData.usage?.prompt_tokens || 0;
      const outputTokens = resData.usage?.completion_tokens || 0;
      const estimatedCost = (inputTokens * 0.0000025) + (outputTokens * 0.00001);

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
        errorMessage: error.message || 'OpenAI document extraction failed.',
        errorCategory: 'PROVIDER_ERROR'
      };
    }
  }
}
