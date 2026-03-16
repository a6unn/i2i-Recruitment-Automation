import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

export async function callClaude(params: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const claude = getClaudeClient();

  const response = await claude.messages.create({
    model: params.model || 'claude-sonnet-4-20250514',
    max_tokens: params.maxTokens || 4096,
    temperature: params.temperature ?? 0,
    system: params.system,
    messages: [{ role: 'user', content: params.prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }
  return textBlock.text;
}
