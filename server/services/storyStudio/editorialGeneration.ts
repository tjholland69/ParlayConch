import OpenAI from "openai";
import type { StorySectionKind } from "@shared/schema";
import { buildSectionPrompt, PROMPT_VERSION, type SectionPromptContext } from "./promptAssembly";

// Thin wrapper around the LLM call. Deliberately not a full provider
// abstraction yet (RFC-001 §7.5) — there's only one provider in use anywhere
// in this codebase today. Revisit if/when a second provider is actually added.

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return null;
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

export interface GeneratedSection {
  content: string;
  promptVersion: string;
}

export async function generateSection(kind: StorySectionKind, ctx: SectionPromptContext): Promise<GeneratedSection> {
  const client = getOpenAI();
  if (!client) {
    return {
      content: "AI generation is not available in this environment. Set AI_INTEGRATIONS_OPENAI_API_KEY to enable Story Studio drafting.",
      promptVersion: PROMPT_VERSION,
    };
  }

  const prompt = buildSectionPrompt(kind, ctx);
  const response = await client.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 250,
  });

  return {
    content: response.choices[0]?.message?.content?.trim() ?? "Unable to generate this section right now.",
    promptVersion: PROMPT_VERSION,
  };
}
