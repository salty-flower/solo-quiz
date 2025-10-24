import katexImport from "katex";

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
        if (input.slice(j, j + delimiter.length) === delimiter) {
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

export function renderWithKatex(input: string): string {
  const tokens = tokenizeMath(input);
  return tokens
    .map((token) => {
      if (token.type === "text") {
        return escapeHtml(token.content);
      }

      try {
        return katex.renderToString(token.content, {
          throwOnError: false,
          displayMode: token.display,
          trust: false,
          strict: "ignore",
        });
      } catch (error) {
        console.warn("KaTeX failed to render", error);
        return escapeHtml(token.content);
      }
    })
    .join("");
}
