import type {
  LLMProvider,
  RawCompletionProvider,
  DashboardSpec,
  TableSchema,
  ChatMessage,
  PatchOp,
} from '../../types';
import {
  buildGenerateDashboardPrompt,
  buildRefinementPrompt,
  validateDashboardSpec,
} from './prompts';

export class OpenAIProvider implements LLMProvider, RawCompletionProvider {
  name = 'openai';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateDashboard(
    schema: TableSchema,
    domainContext?: string,
  ): Promise<DashboardSpec> {
    const prompt = buildGenerateDashboardPrompt(schema, domainContext);
    const response = await this.callAPI(prompt);
    const spec = this.parseJSON(response);

    if (!validateDashboardSpec(spec)) {
      throw new Error('AI generated an invalid dashboard spec. Please try again.');
    }

    return spec as DashboardSpec;
  }

  async refineDashboard(
    currentSpec: DashboardSpec,
    userMessage: string,
    schema: TableSchema,
    history: ChatMessage[],
    domainContext?: string,
  ): Promise<{
    patches: PatchOp[];
    explanation: string;
    followUps: string[];
    educationalNote?: string;
  }> {
    const prompt = buildRefinementPrompt(currentSpec, userMessage, schema, history, domainContext);
    const response = await this.callAPI(prompt);
    const result = this.parseJSON(response);

    if (!result || !Array.isArray(result.patches)) {
      throw new Error('AI generated an invalid refinement response.');
    }

    return {
      patches: result.patches as PatchOp[],
      explanation: String(result.explanation || ''),
      followUps: Array.isArray(result.followUps) ? result.followUps.map(String) : [],
      educationalNote: result.educationalNote ? String(result.educationalNote) : undefined,
    };
  }

  async generateRawCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your OpenAI API key in settings.');
      }
      throw new Error(
        `OpenAI API error: ${(error as Record<string, unknown>).error?.toString() || response.statusText}`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI API');
    }
    return content;
  }

  private async callAPI(prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'system',
            content: 'You are an expert data analyst. Always respond with valid JSON only, no markdown fences or extra text.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your OpenAI API key in settings.');
      }
      throw new Error(
        `OpenAI API error: ${(error as Record<string, unknown>).error?.toString() || response.statusText}`
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI API');
    }
    return content;
  }

  private parseJSON(text: string): Record<string, unknown> {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error(`Failed to parse AI response as JSON: ${cleaned.slice(0, 200)}`);
    }
  }
}
