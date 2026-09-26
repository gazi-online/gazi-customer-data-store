/**
 * src/lib/names/BengaliNameTransliterator.ts
 *
 * Bengali script detection utility.
 *
 * NOTE: The production Bengali name suggestion engine has been migrated to
 * GoogleInputToolsProvider.ts, which calls the Google Input Tools HTTPS endpoint.
 *
 * This file now provides only:
 *   - isBengaliScript()   — used by ReviewPanel, GoogleInputToolsProvider, and tests
 *
 * The previous custom TOKEN_DICT / VOWEL_MATRA / CONSONANT_MAP / phoneticTransliterate /
 * suggestBengaliNames / buildCombinations have been intentionally removed.
 * They were checkpoint commit 035de9b. The production path is Google Input Tools.
 */

/**
 * Returns true if the given string contains Bengali Unicode characters (U+0980–U+09FF).
 *
 * Used by:
 *   - ReviewPanel  → detect document-derived Bengali name (Case A)
 *   - GoogleInputToolsProvider → skip request when name is already Bengali
 *   - nameSafety integration points
 */
export function isBengaliScript(value: string): boolean {
  return /[\u0980-\u09FF]/.test(value);
}

export { hasMeaningfulNativeScript } from './nameSafety';
