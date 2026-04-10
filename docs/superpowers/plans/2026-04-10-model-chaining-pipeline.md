# Model Chaining Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split dashboard generation into a two-stage pipeline where a "reasoning" model designs chart intents and a "SQL" model writes the DuckDB queries, with each stage pluggable to any model.

**Architecture:** Introduce a `ModelChain` abstraction that orchestrates two provider roles: `reasoner` (produces structured chart intents without SQL) and `sqlWriter` (converts each intent + schema into DuckDB SQL). The existing single-model path remains as the default. When a user configures a SQL model, the chain activates automatically. The `LLMProvider` interface stays unchanged externally — the chain implements it.

**Tech Stack:** React, TypeScript, Ollama (local models), existing Anthropic/OpenAI providers

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/types/index.ts` | Add `ChartIntent` type, extend `AppSettings` with `sqlModel` field |
| `src/services/llm/chain.ts` | **NEW** — `ModelChain` class implementing `LLMProvider`, orchestrates reasoner + sqlWriter |
| `src/services/llm/prompts.ts` | Add `buildIntentPrompt()` and `buildSQLFromIntentPrompt()`, keep existing prompts intact |
| `src/services/llm/provider.ts` | Wire chain into `withSelfCorrection` |
| `src/services/llm/ollama.ts` | Add `generateRawCompletion()` for simple prompt→text (used by chain) |
| `src/services/llm/anthropic.ts` | Add `generateRawCompletion()` |
| `src/services/llm/openai.ts` | Add `generateRawCompletion()` |
| `src/components/Settings.tsx` | Add optional "SQL Model" field when Ollama is selected |
| `src/hooks/useSettings.ts` | Default for new `sqlModel` field |
| `src/App.tsx` | Construct `ModelChain` when `sqlModel` is configured |

---

### Task 1: Add `ChartIntent` type and `sqlModel` setting

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/hooks/useSettings.ts`

The `ChartIntent` is the intermediate representation between the two models — it describes *what* to visualize without writing SQL.

- [ ] **Step 1: Add `ChartIntent` type to `src/types/index.ts`**

Add after the `ChartSpec` interface:

```typescript
/** Intermediate representation: what a chart should show, before SQL is written */
export interface ChartIntent {
  id: string;
  type: ChartType;
  title: string;
  description: string;
  /** Natural language description of the query, e.g. "total worldwide gross grouped by genre, top 10" */
  intent: string;
  xColumn: string;
  yColumn: string;
  colorColumn?: string;
}

/** Dashboard spec with intents instead of SQL — output of the reasoning stage */
export interface DashboardIntent {
  title: string;
  description?: string;
  charts: ChartIntent[];
  summaryStats?: SummaryStatIntent[];
}

export interface SummaryStatIntent {
  label: string;
  /** Natural language description, e.g. "count of all rows" */
  intent: string;
  format?: string;
}
```

- [ ] **Step 2: Add `RawCompletionProvider` interface to `src/types/index.ts`**

Add after the `LLMProvider` interface:

```typescript
/** Minimal interface for models that just do prompt → text completion */
export interface RawCompletionProvider {
  name: string;
  generateRawCompletion(systemPrompt: string, userPrompt: string): Promise<string>;
}
```

- [ ] **Step 3: Add `sqlModel` to `AppSettings` in `src/types/index.ts`**

```typescript
export interface AppSettings {
  llmProvider: 'anthropic' | 'openai' | 'ollama';
  apiKey: string;
  model: string;
  ollamaUrl: string;
  /** Optional dedicated SQL model (e.g., 'duckdb-nsql'). When set, enables model chaining. */
  sqlModel: string;
  dataQualityLevel: 'off' | 'subtle' | 'verbose';
  domainContext: string;
}
```

- [ ] **Step 4: Add default for `sqlModel` in `src/hooks/useSettings.ts`**

Add `sqlModel: ''` to the `defaults` object:

```typescript
const defaults: AppSettings = {
  llmProvider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  ollamaUrl: 'http://localhost:11434',
  sqlModel: '',
  dataQualityLevel: 'subtle',
  domainContext: '',
};
```

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/hooks/useSettings.ts
git commit -m "feat: add ChartIntent types and sqlModel setting for model chaining"
```

---

### Task 2: Add `generateRawCompletion` to each provider

**Files:**
- Modify: `src/services/llm/ollama.ts`
- Modify: `src/services/llm/anthropic.ts`
- Modify: `src/services/llm/openai.ts`

Each provider needs a simple `generateRawCompletion(systemPrompt, userPrompt) → string` method so the chain can call either model with arbitrary prompts. This reuses each provider's existing HTTP/auth logic.

- [ ] **Step 1: Add to `OllamaProvider` in `src/services/llm/ollama.ts`**

Add the `RawCompletionProvider` import and implement the method. The class already has `callAPI` which is close, but it hardcodes the system prompt. Add a more flexible method:

```typescript
import type {
  LLMProvider,
  RawCompletionProvider,
  DashboardSpec,
  TableSchema,
  ChatMessage,
  PatchOp,
} from '../../types';
```

Update the class declaration:

```typescript
export class OllamaProvider implements LLMProvider, RawCompletionProvider {
```

Add method after `refineDashboard`:

```typescript
  async generateRawCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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
    if (!content) throw new Error('Empty response from Ollama');
    return content;
  }
```

- [ ] **Step 2: Add to `AnthropicProvider` in `src/services/llm/anthropic.ts`**

Same pattern — add `RawCompletionProvider` to imports and implements clause. Add method that calls the Anthropic messages API with arbitrary system/user prompts:

```typescript
import type {
  LLMProvider,
  RawCompletionProvider,
  DashboardSpec,
  TableSchema,
  ChatMessage,
  PatchOp,
} from '../../types';
```

Update class declaration:

```typescript
export class AnthropicProvider implements LLMProvider, RawCompletionProvider {
```

Add method (reuse existing `callAPI` pattern from the class):

```typescript
  async generateRawCompletion(systemPrompt: string, userPrompt: string): Promise<string> {
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
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Anthropic error: ${(error as any).error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = (data as any).content?.[0]?.text;
    if (!content) throw new Error('Empty response from Anthropic');
    return content;
  }
```

- [ ] **Step 3: Add to `OpenAIProvider` in `src/services/llm/openai.ts`**

Same pattern:

```typescript
import type {
  LLMProvider,
  RawCompletionProvider,
  DashboardSpec,
  TableSchema,
  ChatMessage,
  PatchOp,
} from '../../types';
```

Update class declaration:

```typescript
export class OpenAIProvider implements LLMProvider, RawCompletionProvider {
```

Add method:

```typescript
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
      throw new Error(`OpenAI error: ${(error as any).error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = (data as any).choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');
    return content;
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/services/llm/ollama.ts src/services/llm/anthropic.ts src/services/llm/openai.ts
git commit -m "feat: add generateRawCompletion to all LLM providers"
```

---

### Task 3: Write the intent and SQL prompt builders

**Files:**
- Modify: `src/services/llm/prompts.ts`

Two new prompt builders. `buildIntentPrompt` asks the reasoning model to produce `DashboardIntent` JSON (chart descriptions, no SQL). `buildSQLFromIntentPrompt` gives the SQL model one intent + the schema and asks for a single SQL query.

- [ ] **Step 1: Add `buildIntentPrompt` to `src/services/llm/prompts.ts`**

Add after the existing `buildGenerateDashboardPrompt` function. This reuses the existing `describeSchema` helper:

```typescript
/**
 * Stage 1 prompt: ask the reasoning model to design chart intents (no SQL).
 */
export function buildIntentPrompt(
  schema: TableSchema,
  domainContext?: string,
): string {
  return `You are Billy, an expert data analyst. You are given a table's schema and statistics. Design an insightful dashboard — but do NOT write SQL. Instead, describe what each chart should show in plain English.

## Data
${describeSchema(schema)}

${domainContext ? `## Domain Context\n${domainContext}\n` : ''}

## Task
Design 3-5 charts and 2-4 summary statistics. For each, describe the intent in plain English. A separate SQL specialist model will write the queries.

## Heuristics
- Numeric columns with high cardinality → measures (SUM, AVG, COUNT)
- String/categorical columns with low cardinality (< 30 distinct) → dimensions (group by)
- Date/timestamp columns → time dimensions (group by month or day)
- ID columns (unique count ≈ row count) → exclude from default views
- Prefer a mix of chart types for visual variety
- Always include a time-series view if a date column exists

## Chart Types
- bar/barH: categorical dimension × numeric measure
- line: time dimension × numeric measure (trends)
- scatter: two numeric measures (correlation)
- histogram: distribution of a single numeric column
- area: time dimension × numeric measure (cumulative or stacked)
- heatmap: two categorical dimensions × numeric measure

## Output Format
Return ONLY a JSON object (no markdown fences):
{
  "title": "string — dashboard title",
  "description": "string — one sentence summary",
  "charts": [
    {
      "id": "chart_1",
      "type": "bar | barH | line | area | scatter | histogram | heatmap",
      "title": "string — chart title",
      "description": "string — what this chart reveals",
      "intent": "string — plain English description of the query, e.g. 'total worldwide gross grouped by genre, sorted descending, top 10'",
      "xColumn": "string — result column for x-axis",
      "yColumn": "string — result column for y-axis",
      "colorColumn": "string | null"
    }
  ],
  "summaryStats": [
    {
      "label": "string — stat label",
      "intent": "string — plain English, e.g. 'count of all rows'",
      "format": "string | null — d3-format string like '$,.0f'"
    }
  ]
}

IMPORTANT:
- Do NOT include any SQL. The "intent" field is plain English only.
- xColumn and yColumn should describe the output column names the SQL should produce.
- Be specific in intents: mention column names, aggregations, sort order, limits.`;
}
```

- [ ] **Step 2: Add `buildSQLFromIntentPrompt` to `src/services/llm/prompts.ts`**

This is the prompt sent to the SQL model for each individual chart/stat. It's kept minimal and structured the way duckdb-nsql expects:

```typescript
/**
 * Stage 2 prompt: ask the SQL model to write one DuckDB query for an intent.
 */
export function buildSQLFromIntentSystemPrompt(schema: TableSchema): string {
  // Build a CREATE TABLE statement from the schema for the SQL model
  const colDefs = schema.columns.map(col => {
    const escaped = col.name.includes(' ') || col.name.includes('"')
      ? `"${col.name.replace(/"/g, '""')}"`
      : `"${col.name}"`;
    return `  ${escaped} ${col.type}`;
  });

  return `Here is the database schema that the SQL query will run on:
CREATE TABLE "${schema.tableName}" (
${colDefs.join(',\n')}
);

The table has ${schema.rowCount.toLocaleString()} rows.

Rules:
- Write valid DuckDB SQL only. No explanation, no markdown fences.
- Return ONLY the SQL query, nothing else.
- Use double quotes for column names.
- The query must be a complete, self-contained SELECT statement.`;
}

export function buildSQLFromIntentUserPrompt(intent: string): string {
  return intent;
}
```

- [ ] **Step 3: Add `validateIntentSpec` to `src/services/llm/prompts.ts`**

Similar to `validateDashboardSpec` but for the intent format:

```typescript
export function validateIntentSpec(spec: unknown): spec is DashboardIntent {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as Record<string, unknown>;
  if (typeof s.title !== 'string') return false;
  if (!Array.isArray(s.charts)) return false;

  for (const chart of s.charts) {
    if (typeof chart !== 'object' || !chart) return false;
    const c = chart as Record<string, unknown>;
    if (typeof c.id !== 'string') return false;
    if (!VALID_CHART_TYPES.includes(c.type as ChartType)) return false;
    if (typeof c.intent !== 'string') return false;
    if (typeof c.xColumn !== 'string') return false;
    if (typeof c.yColumn !== 'string') return false;
  }

  return true;
}
```

Add the `DashboardIntent` and `SummaryStatIntent` imports at the top of the file:

```typescript
import type { TableSchema, DashboardSpec, DashboardIntent, SummaryStatIntent, ChatMessage, ChartType } from '../../types';
```

- [ ] **Step 4: Commit**

```bash
git add src/services/llm/prompts.ts
git commit -m "feat: add intent and SQL prompt builders for model chaining"
```

---

### Task 4: Build the `ModelChain` class

**Files:**
- Create: `src/services/llm/chain.ts`

This is the core orchestration. It implements `LLMProvider` so the rest of the app doesn't know it's talking to two models. Stage 1 calls the reasoner for intents, stage 2 fans out to the SQL model for each chart/stat in parallel.

- [ ] **Step 1: Create `src/services/llm/chain.ts`**

```typescript
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
    const raw = await this.sqlWriter.generateRawCompletion(systemPrompt, userPrompt);
    return this.cleanSQL(raw);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/services/llm/chain.ts
git commit -m "feat: add ModelChain class for two-stage dashboard generation"
```

---

### Task 5: Wire the chain into App.tsx and Settings

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Settings.tsx`

When `settings.sqlModel` is non-empty, construct a `ModelChain` instead of using the single provider directly. The SQL model always runs through a fresh `OllamaProvider` instance (since duckdb-nsql is a local model).

- [ ] **Step 1: Update `src/App.tsx` — import and construct the chain**

Add import at the top:

```typescript
import { ModelChain } from './services/llm/chain';
```

Update the `useEffect` that initializes the LLM provider (around line 32-42). Replace the entire effect:

```typescript
  useEffect(() => {
    let baseProvider: (LLMProvider & RawCompletionProvider) | null = null;

    if (settings.llmProvider === 'ollama') {
      baseProvider = new OllamaProvider(settings.model, settings.ollamaUrl);
    } else if (settings.apiKey) {
      if (settings.llmProvider === 'openai') {
        baseProvider = new OpenAIProvider(settings.apiKey, settings.model);
      } else {
        baseProvider = new AnthropicProvider(settings.apiKey, settings.model);
      }
    }

    if (!baseProvider) return;

    // If a dedicated SQL model is configured, use model chaining
    if (settings.sqlModel) {
      const sqlProvider = new OllamaProvider(settings.sqlModel, settings.ollamaUrl);
      setLLMProvider(withSelfCorrection(new ModelChain(baseProvider, sqlProvider)));
    } else {
      setLLMProvider(withSelfCorrection(baseProvider));
    }
  }, [settings.apiKey, settings.model, settings.llmProvider, settings.ollamaUrl, settings.sqlModel]);
```

Import `RawCompletionProvider` type if needed for the cast (the providers already implement both interfaces after Task 2).

- [ ] **Step 2: Update `src/components/Settings.tsx` — add SQL Model field**

Add to the Ollama suggestions datalist:

```typescript
const MODELS: Record<string, { label: string; value: string }[]> = {
  // ... existing entries ...
  ollama: [
    { label: 'Llama 3.1', value: 'llama3.1' },
    { label: 'Llama 3.1 70B', value: 'llama3.1:70b' },
    { label: 'Qwen 2.5 Coder', value: 'qwen2.5-coder' },
    { label: 'Mistral', value: 'mistral' },
    { label: 'DeepSeek Coder V2', value: 'deepseek-coder-v2' },
    { label: 'Gemma 2', value: 'gemma2' },
    { label: 'Command R+', value: 'command-r-plus' },
  ],
};

const SQL_MODELS = [
  { label: 'DuckDB NSQL 7B', value: 'duckdb-nsql' },
  { label: 'SQLCoder', value: 'sqlcoder' },
  { label: 'Code Llama', value: 'codellama' },
];
```

Add a new field in the settings form, after the Model section and before Data Quality. Only show when Ollama is selected OR when using a cloud provider (the SQL model always runs locally via Ollama):

```tsx
          {/* SQL Model (optional — enables model chaining) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              SQL Model <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={settings.sqlModel}
              onChange={e => onUpdate({ sqlModel: e.target.value })}
              placeholder="e.g., duckdb-nsql"
              list="sql-models"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-300 font-mono"
            />
            <datalist id="sql-models">
              {SQL_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </datalist>
            <p className="text-xs text-slate-400 mt-1">
              {settings.sqlModel
                ? 'Model chaining active: your main model designs charts, this model writes SQL.'
                : 'Leave empty to use your main model for everything. Set to a local Ollama model (e.g., duckdb-nsql) to split reasoning from SQL generation.'}
            </p>
            {settings.sqlModel && !isOllama && (
              <p className="text-xs text-amber-600 mt-1">
                SQL model runs locally via Ollama at {settings.ollamaUrl}. Make sure Ollama is running.
              </p>
            )}
          </div>
```

When the SQL model is set and the main provider is NOT Ollama, we also need the Ollama URL to be configurable. Move the Ollama URL field out of the `isOllama` conditional so it shows whenever `sqlModel` is set:

```tsx
          {/* Ollama URL — shown when Ollama is provider OR when SQL model is set */}
          {(isOllama || settings.sqlModel) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Ollama URL
              </label>
              <input
                type="text"
                value={settings.ollamaUrl}
                onChange={e => onUpdate({ ollamaUrl: e.target.value })}
                placeholder="http://localhost:11434"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">
                Default: http://localhost:11434. Make sure Ollama is running.
              </p>
            </div>
          )}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/Settings.tsx
git commit -m "feat: wire model chain into app — SQL model setting activates chaining"
```

---

### Task 6: Update `withSelfCorrection` to handle chain errors

**Files:**
- Modify: `src/services/llm/provider.ts`

The self-correction wrapper needs to recognize chain-specific errors (like "invalid dashboard intent spec") as retryable.

- [ ] **Step 1: Update `isRetryableError` in `src/services/llm/provider.ts`**

```typescript
function isRetryableError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('invalid dashboard spec') ||
    msg.includes('invalid dashboard intent') ||
    msg.includes('invalid refinement') ||
    msg.includes('failed to parse') ||
    msg.includes('json') ||
    msg.includes('sql validation failed') ||
    msg.includes('model chain produced')
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/llm/provider.ts
git commit -m "feat: extend self-correction to handle model chain errors"
```

---

### Task 7: Verify the build and test manually

**Files:** None (verification only)

- [ ] **Step 1: Type-check**

Run: `npx vite build 2>&1`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Manual test — single model (no SQL model set)**

1. Start the dev server: `npm run dev`
2. Open browser, load earthquakes sample dataset
3. Verify dashboard generates normally (same behavior as before)

- [ ] **Step 3: Manual test — model chain**

1. Pull duckdb-nsql: `ollama pull duckdb-nsql`
2. In Billy settings, set SQL Model to `duckdb-nsql`
3. Load a sample dataset
4. Verify dashboard generates (charts should have working SQL)
5. Open debug mode (`localStorage.setItem('billy_debug', 'true')`) and check console for chain execution logs

- [ ] **Step 4: Commit any fixes from manual testing**

```bash
git add -A
git commit -m "fix: address issues found during model chain manual testing"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Types + settings foundation |
| 2 | `generateRawCompletion` on all 3 providers |
| 3 | Intent + SQL prompt builders |
| 4 | `ModelChain` orchestrator class |
| 5 | Wire into App + Settings UI |
| 6 | Self-correction handles chain errors |
| 7 | Build verification + manual testing |

The chain is **opt-in**: leave SQL Model empty and everything works exactly as before. Set it to `duckdb-nsql` (or any Ollama model) and the pipeline splits automatically.
