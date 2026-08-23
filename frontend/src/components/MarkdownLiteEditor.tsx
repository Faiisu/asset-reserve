import { Bold, Heading1, Heading2, Heading3, Italic, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Textarea } from "./ui";

type WrapKind = "bold" | "italic";
type HeadingKind = "h1" | "h2" | "h3";

const HEADING_PREFIX: Record<HeadingKind, string> = { h1: "# ", h2: "## ", h3: "### " };

/**
 * Deliberately not a contentEditable/execCommand rich-text editor -- a plain
 * Textarea plus a toolbar that inserts markdown-lite syntax at the cursor
 * (same pattern GitHub's comment box uses). Simpler, no cross-browser
 * quirks, and the syntax it inserts is exactly what
 * backend/src/email-templates/template-markup.ts renders, so what's typed
 * here is never ambiguous.
 */
export function MarkdownLiteEditor({
  value,
  onChange,
  placeholders,
  rows = 8,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholders: string[];
  rows?: number;
  /** Same cap the API enforces. Applied to typing via the Textarea's own
   * maxLength, and to toolbar insertions below -- those write through
   * onChange directly, which the attribute never sees. */
  maxLength?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [placeholderMenuOpen, setPlaceholderMenuOpen] = useState(false);

  function emit(next: string) {
    onChange(maxLength === undefined ? next : next.slice(0, maxLength));
  }

  function applyAtSelection(transform: (selected: string) => string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const selected = value.slice(selectionStart, selectionEnd);
    const replacement = transform(selected);
    const next = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
    emit(next);
    // Restore focus + a sensible selection after React re-renders the
    // controlled value -- without the timeout, the browser hasn't
    // committed the new value to the DOM yet and the range would be
    // clamped to the old (shorter) text.
    requestAnimationFrame(() => {
      el.focus();
      const cursor = selectionStart + replacement.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function wrapSelection(kind: WrapKind) {
    const marker = kind === "bold" ? "**" : "*";
    applyAtSelection((selected) => `${marker}${selected || (kind === "bold" ? "bold text" : "italic text")}${marker}`);
  }

  function prefixLine(kind: HeadingKind) {
    const el = textareaRef.current;
    if (!el) return;
    const lineStart = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const prefix = HEADING_PREFIX[kind];
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    emit(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = el.selectionStart + prefix.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function insertPlaceholder(token: string) {
    applyAtSelection(() => `{{${token}}}`);
    setPlaceholderMenuOpen(false);
  }

  return (
    <div className="markdown-lite-editor">
      <div className="markdown-lite-editor__toolbar">
        <button type="button" title="Bold" onClick={() => wrapSelection("bold")}>
          <Bold size={15} />
        </button>
        <button type="button" title="Italic" onClick={() => wrapSelection("italic")}>
          <Italic size={15} />
        </button>
        <button type="button" title="Heading 1" onClick={() => prefixLine("h1")}>
          <Heading1 size={15} />
        </button>
        <button type="button" title="Heading 2" onClick={() => prefixLine("h2")}>
          <Heading2 size={15} />
        </button>
        <button type="button" title="Heading 3" onClick={() => prefixLine("h3")}>
          <Heading3 size={15} />
        </button>
        {placeholders.length > 0 && (
          <div className="markdown-lite-editor__placeholder-menu">
            <button
              type="button"
              title="Insert placeholder"
              onClick={() => setPlaceholderMenuOpen((open) => !open)}
            >
              <Plus size={15} /> Placeholder
            </button>
            {placeholderMenuOpen && (
              <div className="markdown-lite-editor__placeholder-list">
                {placeholders.map((token) => (
                  <button key={token} type="button" onClick={() => insertPlaceholder(token)}>
                    {`{{${token}}}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        className="markdown-lite-editor__textarea"
      />
    </div>
  );
}
