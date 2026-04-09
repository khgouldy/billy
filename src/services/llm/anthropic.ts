import type {
  LLMProvider,
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

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514') {
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

  private async callAPI(prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your Anthropic API key in settings.');
      }
      throw new Error(
        `Anthropic API error: ${(error as Record<string, unknown>).error?.toString() || response.statusText}`
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;
    if (!content) {
      throw new Error('Empty response from Anthropic API');
    }
    return content;
  }

  private parseJSON(text: string): Record<string, unknown> {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      return JSON.parse(cleaned);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error(`Failed to parse AI response as JSON: ${cleaned.slice(0, 200)}`);
    }
  }
}
