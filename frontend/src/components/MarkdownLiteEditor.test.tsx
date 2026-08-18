import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarkdownLiteEditor } from "./MarkdownLiteEditor";

function setSelection(textarea: HTMLTextAreaElement, start: number, end: number) {
  textarea.setSelectionRange(start, end);
}

describe("MarkdownLiteEditor", () => {
  it("wraps the current selection in ** when Bold is clicked", () => {
    const onChange = vi.fn();
    render(<MarkdownLiteEditor value="hello world" onChange={onChange} placeholders={[]} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setSelection(textarea, 0, 5); // "hello"

    fireEvent.click(screen.getByTitle("Bold"));

    expect(onChange).toHaveBeenCalledWith("**hello** world");
  });

  it("wraps the current selection in * when Italic is clicked", () => {
    const onChange = vi.fn();
    render(<MarkdownLiteEditor value="hello world" onChange={onChange} placeholders={[]} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setSelection(textarea, 6, 11); // "world"

    fireEvent.click(screen.getByTitle("Italic"));

    expect(onChange).toHaveBeenCalledWith("hello *world*");
  });

  it("prefixes the current line with # when Heading 1 is clicked", () => {
    const onChange = vi.fn();
    render(<MarkdownLiteEditor value="Title line" onChange={onChange} placeholders={[]} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setSelection(textarea, 3, 3);

    fireEvent.click(screen.getByTitle("Heading 1"));

    expect(onChange).toHaveBeenCalledWith("# Title line");
  });

  it("inserts a placeholder token at the cursor from the placeholder menu", () => {
    const onChange = vi.fn();
    render(
      <MarkdownLiteEditor
        value="Hi , welcome"
        onChange={onChange}
        placeholders={["requesterName"]}
      />,
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    setSelection(textarea, 3, 3);

    fireEvent.click(screen.getByTitle("Insert placeholder"));
    fireEvent.click(screen.getByText("{{requesterName}}"));

    expect(onChange).toHaveBeenCalledWith("Hi {{requesterName}}, welcome");
  });
});
