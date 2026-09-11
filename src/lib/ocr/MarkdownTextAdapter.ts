/**
 * Thin deterministic adapter to convert MarkItDown structured Markdown
 * into plain structured key-value lines for DocumentClassifier and DocumentTextParser.
 * 
 * Privacy: Does not log or persist any document content.
 * Deterministic: Zero AI or external network calls.
 */
export class MarkdownTextAdapter {
  /**
   * Transforms raw markdown text from MarkItDown into clean, line-delimited
   * key-value text suitable for DocumentTextParser.
   */
  public static adaptToStructuredText(markdown: string): string {
    if (!markdown || markdown.trim().length === 0) {
      return '';
    }

    const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const processedLines: string[] = [];

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      // 1. Remove markdown horizontal rules & image references
      if (/^[-*_]{3,}$/.test(line)) continue;
      if (/^!\[.*?\]\(.*?\)/.test(line)) continue;

      // 2. Strip headers (# Header -> Header)
      line = line.replace(/^#{1,6}\s+/, '');

      // 3. Strip bullet points (- Item -> Item, * Item -> Item)
      line = line.replace(/^[-*+]\s+/, '');

      // 4. Strip markdown bold and italics (**text** -> text, *text* -> text, __text__ -> text)
      line = line.replace(/[*_]{2,3}(.*?)[*_]{2,3}/g, '$1');
      line = line.replace(/[*_](.*?)[*_]/g, '$1');

      // 5. Handle Markdown Table Rows (| Col1 | Col2 | ... |)
      if (line.startsWith('|') && line.endsWith('|')) {
        // Skip separator rows (| --- | --- |)
        if (/^\|[\s\-:|]+\|$/.test(line)) continue;

        const cells = line
          .split('|')
          .slice(1, -1)
          .map(c => c.trim())
          .filter(c => c.length > 0);

        if (cells.length === 2) {
          // Key-value row: e.g. | Name | Rahul Kumar | -> "Name: Rahul Kumar"
          const [col1, col2] = cells;
          if (col1 && col2) {
            processedLines.push(`${col1}: ${col2}`);
            continue;
          }
        } else if (cells.length > 2) {
          // Multicolumn row: join cells with comma or space
          processedLines.push(cells.join(', '));
          continue;
        } else if (cells.length === 1) {
          processedLines.push(cells[0]);
          continue;
        }
      }

      // 6. Clean link syntax ([text](url) -> text)
      line = line.replace(/\[(.*?)\]\(.*?\)/g, '$1');

      // 7. Normalize internal spaces
      line = line.replace(/[ \t]+/g, ' ').trim();

      if (line.length > 0) {
        processedLines.push(line);
      }
    }

    return processedLines.join('\n');
  }
}
