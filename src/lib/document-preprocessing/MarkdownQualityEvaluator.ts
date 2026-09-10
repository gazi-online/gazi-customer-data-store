import { QualityEvaluationResult } from './types';

/**
 * Deterministic Markdown Quality Evaluator
 * Inspects extracted markdown to ensure it contains meaningful customer document text
 * rather than empty output, pure markup, or image placeholders.
 */
export class MarkdownQualityEvaluator {
  private static readonly MIN_LENGTH = 40;
  private static readonly MIN_ALPHANUMERIC = 25;
  private static readonly MIN_ALPHA_RATIO = 0.30;

  /**
   * Evaluates the extracted markdown text quality.
   */
  public static evaluate(markdown: string | undefined | null): QualityEvaluationResult {
    if (!markdown || typeof markdown !== 'string') {
      return {
        passed: false,
        characterCount: 0,
        alphanumericCount: 0,
        alphaRatio: 0,
        reason: 'Empty or undefined markdown output'
      };
    }

    const trimmed = markdown.trim();
    const characterCount = trimmed.length;

    if (characterCount < this.MIN_LENGTH) {
      return {
        passed: false,
        characterCount,
        alphanumericCount: 0,
        alphaRatio: 0,
        reason: `Insufficient character length (${characterCount} < ${this.MIN_LENGTH})`
      };
    }

    // Strip markdown image placeholders: ![alt](url) or [Image: ...]
    const strippedImages = trimmed
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[Image:\s*.*?\]/gi, '')
      .trim();

    // Strip pure markdown table/horizontal line delimiters: |, -, +, =, #, *
    const textWithoutMarkup = strippedImages.replace(/[|\-+*#=_`~>]/g, ' ').replace(/\s+/g, ' ').trim();

    // Count alphanumeric characters (including Unicode/Indic script characters: \p{L}, \p{N})
    const alphaNumericMatches = textWithoutMarkup.match(/[\p{L}\p{N}]/gu);
    const alphanumericCount = alphaNumericMatches ? alphaNumericMatches.length : 0;

    if (alphanumericCount < this.MIN_ALPHANUMERIC) {
      return {
        passed: false,
        characterCount,
        alphanumericCount,
        alphaRatio: 0,
        reason: `Insufficient alphanumeric content (${alphanumericCount} < ${this.MIN_ALPHANUMERIC})`
      };
    }

    const alphaRatio = alphanumericCount / characterCount;

    if (alphaRatio < this.MIN_ALPHA_RATIO) {
      return {
        passed: false,
        characterCount,
        alphanumericCount,
        alphaRatio,
        reason: `Alphanumeric ratio too low (${alphaRatio.toFixed(2)} < ${this.MIN_ALPHA_RATIO})`
      };
    }

    return {
      passed: true,
      characterCount,
      alphanumericCount,
      alphaRatio
    };
  }
}
