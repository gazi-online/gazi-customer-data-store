import { BaseAIProvider } from './base';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';
import { ClaudeProvider } from './claude';
import { OpenRouterProvider } from './openrouter';

export class AIProviderRegistry {
  private static providers: Map<string, BaseAIProvider> = new Map();

  static {
    // Register default providers
    this.register(new GeminiProvider());
    this.register(new OpenAIProvider());
    this.register(new ClaudeProvider());
    this.register(new OpenRouterProvider());
  }

  static register(provider: BaseAIProvider) {
    this.providers.set(provider.getName(), provider);
  }

  static getProvider(name?: string): BaseAIProvider {
    const providerName = name || process.env.DEFAULT_AI_PROVIDER || 'gemini';
    const provider = this.providers.get(providerName.toLowerCase());
    
    if (!provider) {
      throw new Error(`AI Provider '${providerName}' is not registered or not supported yet.`);
    }
    
    return provider;
  }
}
