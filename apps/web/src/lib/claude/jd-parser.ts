import { z } from 'zod';
import { callClaude } from './client';
import type { ParsedJD } from '@recruitment/shared';

const ParsedJDSchema = z.object({
  jobTitle: z.string(),
  mustHaveSkills: z.array(z.string()),
  niceToHaveSkills: z.array(z.string()),
  experienceRange: z.object({
    min: z.number(),
    max: z.number(),
  }),
  locations: z.array(z.string()),
  education: z.array(z.string()),
  salary: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().optional(),
    })
    .nullable(),
  industry: z.string().optional(),
  employmentType: z.string().optional(),
  keyResponsibilities: z.array(z.string()),
});

const SYSTEM_PROMPT = `You are an expert recruitment analyst. Your job is to parse job descriptions and extract structured data.

You MUST respond with ONLY valid JSON matching this exact schema — no markdown, no code fences, no extra text:

{
  "jobTitle": "string — the role title",
  "mustHaveSkills": ["string — skills that are explicitly required or clearly essential"],
  "niceToHaveSkills": ["string — skills mentioned as preferred, bonus, or good-to-have"],
  "experienceRange": { "min": number, "max": number },
  "locations": ["string — city or region names"],
  "education": ["string — degree or qualification requirements"],
  "salary": { "min": number, "max": number, "currency": "INR/USD/etc" } or null if not mentioned,
  "industry": "string or omit if not clear",
  "employmentType": "Full-time/Part-time/Contract or omit if not clear",
  "keyResponsibilities": ["string — top 5-8 key responsibilities"]
}

Rules:
- For skills, normalize to common industry names (e.g., "ReactJS" not "react.js")
- If experience is stated as "5+ years", use min:5, max:10 as a reasonable range
- If no salary is mentioned, set salary to null
- Extract ALL skills mentioned, categorize correctly as must-have vs nice-to-have
- Locations should be city names when possible
- Keep responsibilities concise — 1 sentence each, max 8`;

export async function parseJD(rawText: string): Promise<ParsedJD> {
  const response = await callClaude({
    system: SYSTEM_PROMPT,
    prompt: `Parse this job description:\n\n${rawText}`,
    maxTokens: 2048,
  });

  const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);
  return ParsedJDSchema.parse(parsed);
}
