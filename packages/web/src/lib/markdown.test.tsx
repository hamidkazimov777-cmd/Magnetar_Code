import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./markdown.js";

const render = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("Markdown", () => {
  it("renders headings, lists, quotes and paragraphs", () => {
    const html = render("# Title\n\nSome text\n\n- one\n- two\n\n> quoted");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<blockquote>quoted</blockquote>");
    expect(html).toContain("<p>Some text</p>");
  });

  it("renders fenced code, including a fence still being streamed", () => {
    expect(render("```ts\nconst a = 1;\n```")).toContain("const a = 1;");
    const partial = render("```ts\nconst a =");
    expect(partial).toContain("<pre");
    expect(partial).toContain("const a =");
  });

  it("renders inline code, bold and italic", () => {
    const html = render("a `code` **bold** *italic*");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("never emits markup that came from the text", () => {
    // The whole reason this renderer exists: model output is untrusted, and
    // nothing here goes through dangerouslySetInnerHTML.
    const html = render('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps javascript: links inert", () => {
    const html = render("[click](javascript:alert(1))");
    expect(html).not.toContain("href");
    expect(html).toContain("click");
  });

  it("links http and https", () => {
    const html = render("[docs](https://example.com/x)");
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("survives an empty document", () => {
    expect(render("")).toBe('<div class="md"></div>');
  });
});
