import { z } from 'zod';
import { callClaude } from './client';
import type { ParsedJD, ScoringConfig } from '@recruitment/shared';

const ScoringConfigSchema = z.object({
  skillSynonymGroups: z.array(z.array(z.string())),
  locationAliasGroups: z.array(z.array(z.string())),
  regionGroups: z.record(z.array(z.string())),
  educationGroups: z.array(z.array(z.string())),
  weights: z
    .object({
      skill: z.number(),
      experience: z.number(),
      location: z.number(),
      education: z.number(),
    })
    .optional(),
});

const SYSTEM_PROMPT = `You are a recruitment data specialist. Given extracted job description data, generate a scoring configuration that maps skill synonyms, location aliases, and education equivalences.

You MUST respond with ONLY valid JSON matching this exact schema — no markdown, no code fences, no extra text:

{
  "skillSynonymGroups": [
    ["canonical_name", "variant1", "variant2", ...]
  ],
  "locationAliasGroups": [
    ["primary_city_name", "alias1", "alias2", ...]
  ],
  "regionGroups": {
    "region_name": ["city1", "city2", ...]
  },
  "educationGroups": [
    ["level", "abbreviation1", "abbreviation2", ...]
  ]
}

Rules:
- For EACH skill in mustHaveSkills and niceToHaveSkills, create a synonym group with 3-8 equivalent terms that recruiters commonly see on resumes (e.g., ["react", "reactjs", "react.js", "react js"])
- Use lowercase for all terms
- The first entry in each group is the canonical name
- For locations, group city name variants (e.g., ["bangalore", "bengaluru", "blr"])
- For regionGroups, group nearby cities that are often interchangeable for commuting (e.g., NCR region)
- For education, group degree abbreviations by level: bachelors (b.tech, btech, b.e., bca, bsc, etc.), masters (m.tech, mtech, mca, mba, ms, etc.), doctorate (phd, ph.d, doctoral), diploma (diploma, polytechnic, iti)
- Always include the standard education groups regardless of what the JD specifies`;

export async function generateScoringConfig(parsedJD: ParsedJD): Promise<ScoringConfig | null> {
  try {
    const prompt = `Generate scoring configuration for this job:

Job Title: ${parsedJD.jobTitle}
Must-Have Skills: ${parsedJD.mustHaveSkills.join(', ')}
Nice-to-Have Skills: ${parsedJD.niceToHaveSkills.join(', ')}
Locations: ${parsedJD.locations.join(', ')}
Education: ${parsedJD.education.join(', ')}`;

    const response = await callClaude({
      system: SYSTEM_PROMPT,
      prompt,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 2048,
      temperature: 0,
    });

    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return ScoringConfigSchema.parse(parsed);
  } catch (error) {
    console.error('Failed to generate scoring config:', error);
    return null;
  }
}
