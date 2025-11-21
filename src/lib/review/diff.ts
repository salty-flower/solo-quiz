export type DiffToken = {
  text: string;
  type: "match" | "add" | "remove";
};

function tokenizeAnswer(text: string): string[] {
  return text.trim().length === 0 ? [] : text.trim().split(/\s+/);
}

export function buildDiffTokens(
  userText: string,
  referenceText: string,
): DiffToken[] {
  const userTokens = tokenizeAnswer(userText);
  const referenceTokens = tokenizeAnswer(referenceText);

  const rows = userTokens.length;
  const cols = referenceTokens.length;
  const dp: number[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => 0),
  );

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      if (userTokens[i] === referenceTokens[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;

  while (i < rows && j < cols) {
    if (userTokens[i] === referenceTokens[j]) {
      tokens.push({ text: userTokens[i], type: "match" });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ text: userTokens[i], type: "remove" });
      i += 1;
    } else {
      tokens.push({ text: referenceTokens[j], type: "add" });
      j += 1;
    }
  }

  while (i < rows) {
    tokens.push({ text: userTokens[i], type: "remove" });
    i += 1;
  }

  while (j < cols) {
    tokens.push({ text: referenceTokens[j], type: "add" });
    j += 1;
  }

  return tokens;
}

export function diffClass(token: DiffToken, perspective: "user" | "reference") {
  if (token.type === "match") return "text-foreground";
  if (perspective === "user") {
    return token.type === "remove"
      ? "bg-amber-200/80 text-foreground dark:bg-amber-900/60"
      : "text-muted-foreground opacity-75";
  }
  return token.type === "add"
    ? "bg-primary/20 text-foreground"
    : "text-muted-foreground line-through";
}

export function summarizeDiff(tokens: DiffToken[]) {
  return tokens.reduce(
    (acc, token) => {
      acc[token.type] = (acc[token.type] ?? 0) + 1;
      return acc;
    },
    { match: 0, add: 0, remove: 0 } as Record<DiffToken["type"], number>,
  );
}
