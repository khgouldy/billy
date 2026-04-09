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

export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(model = 'llama3.1', baseUrl = 'http://localhost:11434') {
    this.model = model;
    this.baseUrl = baseUrl;
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
    // Ollama exposes an OpenAI-compatible API
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert data analyst. Always respond with valid JSON only, no markdown fences or extra text.',
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 0 || response.type === 'opaque') {
        throw new Error('Cannot reach Ollama. Make sure it is running at ' + this.baseUrl);
      }
      const error = await response.text().catch(() => '');
      throw new Error(`Ollama error: ${error || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Ollama');
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
