import katexImport from "katex";
import MarkdownIt from "markdown-it";

type KatexInstance = typeof katexImport;

function resolveKatex(): KatexInstance {
  const globalKatex = (globalThis as unknown as { katex?: KatexInstance })
    .katex;
  const instance = katexImport ?? globalKatex;
  if (!instance) {
    throw new Error("KaTeX is not available in the current build");
  }
  return instance;
}

const katex = resolveKatex();

interface Token {
  type: "text" | "math";
  content: string;
  display: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tokenizeMath(input: string): Token[] {
  const tokens: Token[] = [];
  let buffer = "";
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === "$" && i > 0 && input[i - 1] === "\\") {
      buffer = buffer.slice(0, -1);
      buffer += "$";
      i += 1;
      continue;
    }

    if (char === "$") {
      let delimiter = "$";
      let display = false;
      if (input[i + 1] === "$") {
        delimiter = "$$";
        display = true;
      }
      let j = i + delimiter.length;
      let found = false;
      while (j < input.length) {
        if (
          input.slice(j, j + delimiter.length) === delimiter &&
          input[j - 1] !== "\\"
        ) {
          found = true;
          break;
        }
        j += 1;
      }
      if (found) {
        if (buffer) {
          tokens.push({ type: "text", content: buffer, display: false });
          buffer = "";
        }
        const mathContent = input.slice(i + delimiter.length, j);
        tokens.push({ type: "math", content: mathContent, display });
        i = j + delimiter.length;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }
  if (buffer) {
    tokens.push({ type: "text", content: buffer, display: false });
  }
  return tokens;
}

function renderMath(content: string, display: boolean): string {
  try {
    return katex.renderToString(content, {
      throwOnError: false,
      displayMode: display,
      trust: false,
      strict: "ignore",
    });
  } catch (error) {
    console.warn("KaTeX failed to render", error);
    return escapeHtml(content);
  }
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
});

markdown.disable("replacements");

export function renderWithKatex(input: string): string {
  const tokens = tokenizeMath(input);
  const placeholders = new Map<string, string>();
  let index = 0;
  const source = tokens
    .map((token) => {
      if (token.type === "text") {
        return token.content;
      }
      const key = `@@MATH_${index}@@`;
      placeholders.set(key, renderMath(token.content, token.display));
      index += 1;
      return key;
    })
    .join("");

  let rendered = markdown.render(source);
  for (const [placeholder, value] of placeholders.entries()) {
    rendered = rendered.replaceAll(placeholder, value);
  }
  const trimmed = rendered.trim();
  if (
    trimmed.startsWith("<p>") &&
    trimmed.endsWith("</p>") &&
    trimmed.indexOf("<p", 3) === -1
  ) {
    return trimmed.slice(3, -4);
  }
  return rendered;
}
