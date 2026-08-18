import { describe, expect, it } from "vitest";
import {
  markdownToHtml,
  renderTemplateBody,
  renderTemplateSubject,
  substitutePlaceholders,
} from "../src/email-templates/template-markup.js";

describe("substitutePlaceholders", () => {
  it("replaces a known token with its HTML-escaped value", () => {
    expect(substitutePlaceholders("Hi {{name}}!", { name: "Jane" })).toBe("Hi Jane!");
  });

  it("HTML-escapes special characters in the value", () => {
    expect(
      substitutePlaceholders("{{name}}", { name: '<b>"Tom" & Jerry\'s</b>' }),
    ).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&#39;s&lt;/b&gt;");
  });

  it("leaves an unrecognized token as literal text instead of dropping it", () => {
    expect(substitutePlaceholders("Hi {{typo}}!", { name: "Jane" })).toBe("Hi {{typo}}!");
  });
});

describe("markdownToHtml", () => {
  it("renders bold and italic", () => {
    const html = markdownToHtml("This is **bold** and this is *italic*.");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders H1, H2, and H3 from #/##/### line prefixes", () => {
    expect(markdownToHtml("# Big")).toContain("<h1");
    expect(markdownToHtml("## Medium")).toContain("<h2");
    expect(markdownToHtml("### Small")).toContain("<h3");
  });

  it("splits blank-line-separated blocks into separate paragraphs", () => {
    const html = markdownToHtml("First paragraph.\n\nSecond paragraph.");
    expect(html.match(/<p/g)).toHaveLength(2);
  });
});

describe("renderTemplateBody / renderTemplateSubject", () => {
  it("substitutes before markdownifying, in one pipeline", () => {
    const html = renderTemplateBody("Hello **{{name}}**, welcome.", { name: "Jane" });
    expect(html).toContain("<strong>Jane</strong>");
  });

  it("a placeholder value can never inject markdown formatting", () => {
    // "*" in a placeholder value is entity-escaped (renders identically to
    // a literal "*" in any mail client) specifically so markdownToHtml,
    // which runs on the whole text afterward, can't reinterpret it as bold.
    const html = renderTemplateBody("{{name}}", { name: "**not bold**" });
    expect(html).not.toContain("<strong>");
    expect(html).toContain("&#42;&#42;not bold&#42;&#42;");
  });

  it("subject substitutes but does not markdownify or leave HTML entities", () => {
    const subject = renderTemplateSubject("Reservation for {{eventName}}", {
      eventName: "R&D Kickoff",
    });
    expect(subject).toBe("Reservation for R&D Kickoff");
  });

  it("subject round-trips a value containing markdown-lite syntax characters", () => {
    const subject = renderTemplateSubject("{{eventName}}", { eventName: "Q&A: #1 *Best*" });
    expect(subject).toBe("Q&A: #1 *Best*");
  });
});
