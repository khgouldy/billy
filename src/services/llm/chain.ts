import type {
  LLMProvider,
  RawCompletionProvider,
  DashboardSpec,
  DashboardIntent,
  ChartSpec,
  SummaryStat,
  TableSchema,
  ChatMessage,
  PatchOp,
} from '../../types';
import { coordinator } from '@uwdata/mosaic-core';
import {
  buildIntentPrompt,
  buildSQLFromIntentSystemPrompt,
  buildSQLFromIntentUserPrompt,
  validateIntentSpec,
  validateDashboardSpec,
} from './prompts';

/**
 * Two-stage model chain:
 *   1. reasoner  → designs dashboard intents (chart types, titles, descriptions)
 *   2. sqlWriter → converts each intent into a DuckDB SQL query
 *
 * Both stages are pluggable — any provider implementing RawCompletionProvider works.
 * The chain implements LLMProvider so it's a drop-in replacement.
 */
export class ModelChain implements LLMProvider {
  name = 'chain';
  private reasoner: LLMProvider & RawCompletionProvider;
  private sqlWriter: RawCompletionProvider;

  constructor(
    reasoner: LLMProvider & RawCompletionProvider,
    sqlWriter: RawCompletionProvider,
  ) {
    this.reasoner = reasoner;
    this.sqlWriter = sqlWriter;
  }

  async generateDashboard(
    schema: TableSchema,
    domainContext?: string,
  ): Promise<DashboardSpec> {
    // Stage 1: get chart intents from the reasoning model
    const intentPrompt = buildIntentPrompt(schema, domainContext);
    const intentRaw = await this.reasoner.generateRawCompletion(
      'You are an expert data analyst. Always respond with valid JSON only, no markdown fences or extra text.',
      intentPrompt,
    );
    const intentSpec = this.parseJSON(intentRaw);

    if (!validateIntentSpec(intentSpec)) {
      throw new Error('AI generated an invalid dashboard intent spec. Please try again.');
    }

    const intent = intentSpec as DashboardIntent;

    // Stage 2: convert each intent to SQL in parallel
    const systemPrompt = buildSQLFromIntentSystemPrompt(schema);

    const chartPromises = intent.charts.map(async (chart): Promise<ChartSpec> => {
      const sql = await this.generateSQL(systemPrompt, chart.intent);
      return {
        id: chart.id,
        type: chart.type,
        title: chart.title,
        description: chart.description,
        sql,
        xColumn: chart.xColumn,
        yColumn: chart.yColumn,
        colorColumn: chart.colorColumn,
      };
    });

    const statPromises = (intent.summaryStats || []).map(async (stat): Promise<SummaryStat> => {
      const intentForStat = `${stat.intent}. Return a single row with a single column named 'value'.`;
      const sql = await this.generateSQL(systemPrompt, intentForStat);
      return {
        label: stat.label,
        sql,
        format: stat.format,
      };
    });

    const [charts, summaryStats] = await Promise.all([
      Promise.all(chartPromises),
      Promise.all(statPromises),
    ]);

    const spec: DashboardSpec = {
      title: intent.title,
      description: intent.description,
      charts,
      summaryStats,
    };

    if (!validateDashboardSpec(spec)) {
      throw new Error('Model chain produced an invalid dashboard spec.');
    }

    return spec;
  }

  /**
   * Refinement still uses the reasoning model's full capabilities.
   * The chain doesn't split refinement into two stages — the reasoner
   * handles it as a single-model operation since refinement patches
   * are small and need conversational context.
   */
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
    return this.reasoner.refineDashboard(currentSpec, userMessage, schema, history, domainContext);
  }

  private async generateSQL(systemPrompt: string, intent: string): Promise<string> {
    const userPrompt = buildSQLFromIntentUserPrompt(intent);
    let raw = await this.sqlWriter.generateRawCompletion(systemPrompt, userPrompt);
    let sql = this.cleanSQL(raw);

    // Internal retry: if the SQL writer produces invalid SQL, feed the error back once
    try {
      // Dry-run with LIMIT 0 to catch syntax errors without fetching data
      await coordinator().query(`SELECT * FROM (${sql}) _validate LIMIT 0`, { type: 'exec' });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const retryPrompt = `${intent}\n\nYour previous SQL was invalid. Error: ${errMsg}\nFix the SQL and return ONLY the corrected query.`;
      raw = await this.sqlWriter.generateRawCompletion(systemPrompt, retryPrompt);
      sql = this.cleanSQL(raw);
    }

    return sql;
  }

  private cleanSQL(raw: string): string {
    let sql = raw.trim();
    // Strip markdown fences if present
    if (sql.startsWith('```')) {
      sql = sql.replace(/^```(?:sql)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    // Remove trailing semicolons (DuckDB via Mosaic doesn't want them)
    sql = sql.replace(/;\s*$/, '');
    return sql;
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
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error(`Failed to parse AI response as JSON: ${cleaned.slice(0, 200)}`);
    }
  }
}
