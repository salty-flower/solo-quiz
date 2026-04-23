import type { Question } from "../schema";

export interface PartGroupEntry {
  question: Question;
  index: number;
  partLabel: string | null;
}

export interface PartGroup {
  key: string;
  title: string | null;
  isMultipart: boolean;
  entries: PartGroupEntry[];
}

export function buildPartGroups(questions: Question[]): PartGroup[] {
  const groups: PartGroup[] = [];

  questions.forEach((question, index) => {
    const previous = groups[groups.length - 1];
    const part = question.part;

    if (part && previous?.isMultipart && previous.key === part.groupId) {
      previous.entries.push({
        question,
        index,
        partLabel: part.label,
      });
      if (!previous.title && part.title) {
        previous.title = part.title;
      }
      return;
    }

    if (part) {
      groups.push({
        key: part.groupId,
        title: part.title ?? null,
        isMultipart: true,
        entries: [
          {
            question,
            index,
            partLabel: part.label,
          },
        ],
      });
      return;
    }

    groups.push({
      key: question.id,
      title: null,
      isMultipart: false,
      entries: [
        {
          question,
          index,
          partLabel: null,
        },
      ],
    });
  });

  return groups;
}
