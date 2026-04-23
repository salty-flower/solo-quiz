import type { SubjectiveQuestion } from "../schema";

export function rubricWeight(
  rubric: SubjectiveQuestion["rubrics"][number],
): number {
  return rubric.weight ?? 1;
}

export function calculateWeightedRubricFraction(
  rubrics: SubjectiveQuestion["rubrics"],
  breakdown: Array<{ achievedFraction: number }>,
): number {
  if (rubrics.length === 0) {
    return 0;
  }

  const totalWeight = rubrics.reduce(
    (sum, rubric) => sum + rubricWeight(rubric),
    0,
  );
  if (totalWeight === 0) {
    return 0;
  }

  const weightedTotal = rubrics.reduce((sum, rubric, index) => {
    const fraction = breakdown[index]?.achievedFraction ?? 0;
    return sum + fraction * rubricWeight(rubric);
  }, 0);

  return weightedTotal / totalWeight;
}
