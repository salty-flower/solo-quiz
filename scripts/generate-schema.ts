import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { assessmentSchema } from "../src/lib/schema.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputPath = path.resolve(__dirname, "../dist/schema/assessment.json");

const schema = zodToJsonSchema(assessmentSchema, {
  name: "Assessment",
  target: "jsonSchema7",
});

const schemaDocument = {
  ...schema,
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://solo-quiz.dev/schema/assessment.json",
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(schemaDocument, null, 2)}\n`,
  "utf8",
);

console.log(`Assessment schema written to ${outputPath}`);
