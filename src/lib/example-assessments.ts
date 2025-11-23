import type { Assessment } from "./schema";
import sampleAssessmentJson from "../../examples/sample-assessment.json" with {
  type: "json",
};

export type ExampleAssessment = {
  id: string;
  data: Assessment;
};

const SAMPLE_ASSESSMENTS: ExampleAssessment[] = [
  {
    id: "sample-stem",
    data: sampleAssessmentJson as Assessment,
  },
];

export function getExampleAssessments(): ExampleAssessment[] {
  return SAMPLE_ASSESSMENTS;
}

export function findExampleAssessment(
  id: string,
): ExampleAssessment | undefined {
  return SAMPLE_ASSESSMENTS.find((example) => example.id === id);
}
