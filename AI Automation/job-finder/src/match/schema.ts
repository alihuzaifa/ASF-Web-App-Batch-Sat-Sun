import { z } from "zod";

const line = z.string().trim().min(1).max(400);

export const MatchOutput = z.strictObject({
  score: z.number().int().min(0).max(100),
  reasoning: z.string().trim().min(1).max(1500),
  matched_skills: z.array(line).max(30),
  missing_skills: z.array(line).max(30),
  deal_breakers_hit: z.array(line).max(10),
  knockouts: z.array(line).max(10),
  red_flags: z.array(line).max(10),
});
export type MatchOutput = z.infer<typeof MatchOutput>;

export const TailoredCvSchema = z.strictObject({
  headline: line,
  summary: z.string().trim().min(1).max(1200),
  skills: z.array(z.strictObject({ group: line, items: z.array(line).min(1).max(25) })).max(8),
  experience: z.array(z.strictObject({
    title: line,
    company: line,
    location: z.string().trim().max(120),
    start: z.string().trim().max(40),
    end: z.string().trim().max(40),
    bullets: z.array(line).max(8),
  })).max(12),
  projects: z.array(z.strictObject({
    name: line,
    link: z.string().trim().max(300),
    bullets: z.array(line).max(5),
  })).max(8),
  education: z.array(z.strictObject({ degree: line, school: line, year: z.string().trim().max(40) })).max(6),
  certifications: z.array(line).max(12),
  awards: z.array(z.strictObject({ title: line, detail: z.string().trim().max(600) })).max(6),
  languages: z.array(line).max(8),
});
export type TailoredCv = z.infer<typeof TailoredCvSchema>;

export const TailorOutput = z.strictObject({
  cv: TailoredCvSchema,
  email: z.strictObject({
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(3000),
  }),
  cover_letter: z.string().trim().min(1).max(4000),
});
export type TailorOutput = z.infer<typeof TailorOutput>;
