import type { Assessment } from "./schema";

export interface AdapterMetadata {
  name: string;
  description: string;
}

export interface Adapter {
  meta: AdapterMetadata;
  canHandle(input: unknown): boolean;
  adapt(input: unknown): Promise<Assessment>;
}

export async function adaptSurveyJs(_input: unknown): Promise<Assessment> {
  throw new Error("SurveyJS adapter is not implemented yet");
}
