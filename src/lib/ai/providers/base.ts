export interface AIProviderOptions {
  model?: string;
  temperature?: number;
  maxRetries?: number;
}

export type AIErrorCategory = 
  | 'AUTHENTICATION' 
  | 'RATE_LIMIT' 
  | 'QUOTA' 
  | 'MODEL_UNAVAILABLE' 
  | 'NETWORK' 
  | 'PROVIDER_ERROR' 
  | 'INVALID_REQUEST' 
  | 'EXTRACTION_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface AIExtractionResult {
  rawResponse: string;
  parsedJson?: any;
  status: 'success' | 'failed';
  processingTimeMs: number;
  primaryAttemptMs?: number;
  retryAttemptMs?: number;
  apiCallTimeMs?: number;
  jsonParseTimeMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  modelName: string;
  errorMessage?: string;
  errorCategory?: AIErrorCategory;
}

export interface FileData {
  mimeType: string;
  base64Data: string;
}

export abstract class BaseAIProvider {
  protected providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  /**
   * Extracts data from a list of files using the given prompt.
   * Should implement retry logic and basic error handling internally.
   */
  abstract extractData(
    systemInstruction: string,
    prompt: string,
    files: FileData[],
    options?: AIProviderOptions
  ): Promise<AIExtractionResult>;

  getName() {
    return this.providerName;
  }
}
