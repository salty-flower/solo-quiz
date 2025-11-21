# Assessment JSON format

Solo Quiz expects assessments that match the `assessmentSchema` in `src/lib/schema.ts`.

## Root object
- `schemaVersion` (string): must start with `"1."` to allow future upgrades.
- `meta` (object):
  - `title` (string, required)
  - `description` (string, optional)
  - `shuffleQuestions` (boolean, optional) – shuffles question order if true.
  - `timeLimitSec` (positive integer, optional) – countdown timer in seconds.
- `questions` (array): list of question objects.

## Question shapes
All questions share:
- `id` (string)
- `text` (string)
- `weight` (number, optional, defaults to 1)
- `tags` (array of strings, optional)
- `feedback` (object, optional) with `correct` / `incorrect` strings.

Specific types (discriminated by `type`):
- `single`: `options` (2+), `correct` (string option id).
- `multi`: `options` (2+), `correct` (array of option ids).
- `fitb`: `accept` (array of strings or `{ pattern, flags }` regex objects), `normalize` ("trim" | "lower" | "none", optional).
- `numeric`: `correct` (number), `tolerance` (non-negative number, optional).
- `ordering`: `items` (2+ strings), `correctOrder` (2+ strings).
- `subjective`: `rubrics` (array with `title` and `description`).

## Example excerpt
```json
{
  "schemaVersion": "1.0.0",
  "meta": {
    "title": "Sample assessment",
    "description": "Covers multiple formats",
    "shuffleQuestions": true,
    "timeLimitSec": 900
  },
  "questions": [
    {
      "id": "capital",
      "type": "single",
      "text": "What is the capital of France?",
      "options": [
        { "id": "paris", "label": "Paris" },
        { "id": "lyon", "label": "Lyon" }
      ],
      "correct": "paris",
      "tags": ["geography"]
    }
  ]
}
```
