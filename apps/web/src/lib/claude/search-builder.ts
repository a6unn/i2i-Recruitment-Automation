import { callClaude } from './client';
import type { ParsedJD, SearchQueryResult } from '@recruitment/shared';
import { z } from 'zod';

const NAUKRI_CHAR_LIMIT = 500;

const SearchQueryResultSchema = z.object({
  queries: z.array(
    z.object({
      variant: z.enum(['broad', 'focused', 'niche']),
      label: z.string(),
      query: z.string(),
      characterCount: z.number(),
      suggestedFilters: z.object({
        experience: z
          .object({ min: z.number(), max: z.number() })
          .optional(),
        location: z.array(z.string()).optional(),
        salary: z
          .object({ min: z.number().optional(), max: z.number().optional() })
          .optional(),
        freshness: z.string().optional(),
        industry: z.string().optional(),
      }),
    })
  ),
  tips: z.array(z.string()),
});

const SYSTEM_PROMPT = `You are an expert Naukri RESDEX boolean search query builder. Given parsed JD data, generate 3 search query variants optimized for Naukri RESDEX's search engine.

You MUST respond with ONLY valid JSON — no markdown, no code fences, no extra text:

{
  "queries": [
    {
      "variant": "broad",
      "label": "Broad Search — Maximum Reach",
      "query": "boolean query string",
      "characterCount": number,
      "suggestedFilters": {
        "experience": { "min": number, "max": number },
        "location": ["city names"],
        "salary": { "min": number, "max": number },
        "freshness": "Active in X days",
        "industry": "string"
      }
    },
    { "variant": "focused", ... },
    { "variant": "niche", ... }
  ],
  "tips": ["practical tips for this specific search"]
}

Query building rules:
1. **Broad** (OR-heavy): Include all skills with synonyms, use OR liberally. Maximize result count. Example: (React OR ReactJS OR "React.js") AND (Node OR NodeJS OR "Node.js")
2. **Focused** (AND must-haves): Only must-have skills with AND, include common synonyms with OR within each skill group. Example: (React OR ReactJS) AND (Node OR NodeJS) AND (TypeScript OR TS)
3. **Niche** (exact match): Tight query with specific skill combinations, exact terms. Fewest but most relevant results.

Naukri boolean syntax:
- Use AND, OR, NOT operators (uppercase)
- Use parentheses for grouping
- Use quotes for exact phrases: "machine learning"
- Naukri has ~${NAUKRI_CHAR_LIMIT} character limit — stay under this

Synonym expansion is CRITICAL. Always include common variations:
- ReactJS / React.js / React JS / React
- Node.js / NodeJS / Node JS
- PostgreSQL / Postgres / PGSQL
- Machine Learning / ML
- Amazon Web Services / AWS
- Kubernetes / K8s
etc.

Tips should be specific to this JD — not generic advice.`;

export async function generateSearchQueries(
  parsedJD: ParsedJD
): Promise<SearchQueryResult> {
  const prompt = `Generate Naukri RESDEX boolean search queries for this parsed JD:

Job Title: ${parsedJD.jobTitle}
Must-Have Skills: ${parsedJD.mustHaveSkills.join(', ')}
Nice-to-Have Skills: ${parsedJD.niceToHaveSkills.join(', ')}
Experience: ${parsedJD.experienceRange.min}-${parsedJD.experienceRange.max} years
Locations: ${parsedJD.locations.join(', ')}
Industry: ${parsedJD.industry || 'Not specified'}

Remember: Each query must be under ${NAUKRI_CHAR_LIMIT} characters. Include skill synonyms.`;

  const response = await callClaude({
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 2048,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return SearchQueryResultSchema.parse(parsed);
}
