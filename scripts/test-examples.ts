import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAssessment } from "../src/lib/schema.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const examplesDir = path.resolve(__dirname, "../examples");
  const entries = await readdir(examplesDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  if (jsonFiles.length === 0) {
    console.warn("No example JSON files found in examples directory.");
    return;
  }

  let hasFailure = false;
  for (const file of jsonFiles) {
    const filePath = path.join(examplesDir, file);
    try {
      const content = await readFile(filePath, "utf8");
      const raw = JSON.parse(content);
      const result = parseAssessment(raw);
      if (result.ok) {
        console.log(`✅ ${file} is valid.`);
      } else {
        hasFailure = true;
        console.error(`❌ ${file} is invalid:`);
        for (const issue of result.issues) {
          console.error(`  - ${issue.path}: ${issue.message}`);
        }
      }
    } catch (error) {
      hasFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to read ${file}: ${message}`);
    }
  }

  if (hasFailure) {
    process.exitCode = 1;
    throw new Error("Example validation failed");
  }
}

void main();
