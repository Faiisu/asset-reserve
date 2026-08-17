/**
 * Deliberately tiny markdown-lite renderer -- not a general markdown
 * implementation, just the four constructs the admin editor's toolbar
 * exposes (Bold, Italic, H1, H2, H3), matching what the user confirmed they
 * wanted: "text with placeholders" plus basic formatting, not full HTML
 * editing. No external dependency, no contentEditable/execCommand.
 *
 * Order matters and is enforced by only exporting the combined pipeline
 * (renderTemplate): escape placeholder values -> substitute -> markdownify.
 * If markdownify ran before substitution, a placeholder value containing
 * "**" or a leading "#" could inject formatting the admin never wrote.
 */

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

// A single-pass character map, not chained .replace() calls -- chaining
// would re-scan each step's *output*, so an earlier rule's inserted "&"
// (e.g. from "*" -> "&#42;") would get re-escaped by a later "&" rule,
// corrupting the entity. One regex + one lookup guarantees each original
// character is substituted exactly once.
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  // Also neutralize markdown-lite syntax characters -- otherwise a
  // placeholder value like an event name typed as "**IMPORTANT**" would
  // get reinterpreted as bold/heading syntax by markdownToHtml, which runs
  // on the whole text *after* substitution. Numeric entities render
  // identically to the literal character in any mail client, so this is
  // invisible in the final email.
  "*": "&#42;",
  "#": "&#35;",
};
const UNESCAPE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(ESCAPE_MAP).map(([char, entity]) => [entity, char]),
);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"'*#]/g, (char) => ESCAPE_MAP[char]!);
}

function unescapeHtml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39|#42|#35);/g, (entity) => UNESCAPE_MAP[entity]!);
}

/**
 * Replaces {{token}} with the HTML-escaped value for that key. A token with
 * no matching value is left as literal text (not silently dropped) -- an
 * admin who mistypes a placeholder name sees it verbatim in the email
 * rather than a blank gap, which is much easier to notice and fix.
 */
export function substitutePlaceholders(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? escapeHtml(values[key]!)
      : match,
  );
}

function inline(text: string): string {
  // Bold before italic so "**bold**" isn't first read as two "*"-italics.
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/**
 * Converts already-substituted (and thus already-escaped) text into HTML:
 * "#"/"##"/"###" line prefixes become H1-3, blank lines separate
 * paragraphs, single newlines within a paragraph become <br>.
 */
export function markdownToHtml(text: string): string {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const heading = block.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        const level = heading[1]!.length;
        return `<h${level} style="margin: 0 0 8px; font-size: ${20 - level * 2}px;">${inline(heading[2]!)}</h${level}>`;
      }
      return `<p style="margin: 0 0 12px;">${inline(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

/**
 * The combined pipeline every caller should use -- never call
 * substitutePlaceholders/markdownToHtml separately outside this file,
 * the ordering is the whole point.
 */
export function renderTemplateBody(
  bodyMarkdown: string,
  values: Record<string, string>,
): string {
  return markdownToHtml(substitutePlaceholders(bodyMarkdown, values));
}

export function renderTemplateSubject(
  subject: string,
  values: Record<string, string>,
): string {
  // Subject is plain text (no HTML in an email header) -- substitute only,
  // no markdownify, and un-escape since escapeHtml's entities would show up
  // literally in a mail client's subject line.
  return unescapeHtml(substitutePlaceholders(subject, values));
}
