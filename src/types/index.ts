// ─── Schema & Statistics ───────────────────────────────────────

export interface ColumnInfo {
  name: string;
  type: string;           // DuckDB type string
  nullable: boolean;
  distinctCount: number;
  nullCount: number;
  nullPercent: number;
  sampleValues: unknown[];
  min?: unknown;
  max?: unknown;
}

export interface TableSchema {
  tableName: string;
  fileName: string;
  rowCount: number;
  columns: ColumnInfo[];
  sampleRows: Record<string, unknown>[];
}

// ─── Dashboard Spec (Option B — intermediate JSON) ────────────

export interface DashboardSpec {
  title: string;
  description?: string;
  charts: ChartSpec[];
  summaryStats?: SummaryStat[];
}

export type ChartType = 'bar' | 'barH' | 'line' | 'area' | 'scatter' | 'histogram' | 'heatmap';

export interface ChartSpec {
  id: string;
  type: ChartType;
  title: string;
  description?: string;
  sql: string;
  xColumn: string;
  yColumn: string;
  colorColumn?: string;
  /** For histograms: the numeric column to bin */
  binColumn?: string;
}

export interface SummaryStat {
  label: string;
  sql: string;
  format?: string;
}

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

// ─── Patch Operations ──────────────────────────────────────────

export type PatchOp =
  | { op: 'add'; chart: ChartSpec }
  | { op: 'remove'; chartId: string }
  | { op: 'modify'; chartId: string; changes: Partial<ChartSpec> }
  | { op: 'addStat'; stat: SummaryStat }
  | { op: 'removeStat'; label: string }
  | { op: 'replaceAll'; spec: DashboardSpec };

// ─── Chat ──────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** SQL used, if any */
  sql?: string;
  /** Educational callout, if any */
  educationalNote?: string;
  /** Suggested follow-up questions */
  followUps?: string[];
  /** Patch operations generated */
  patches?: PatchOp[];
}

// ─── LLM Provider ──────────────────────────────────────────────

export interface LLMProvider {
  name: string;
  generateDashboard(
    schema: TableSchema,
    domainContext?: string,
  ): Promise<DashboardSpec>;
  refineDashboard(
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
  }>;
}

/** Minimal interface for models that just do prompt → text completion */
export interface RawCompletionProvider {
  name: string;
  generateRawCompletion(systemPrompt: string, userPrompt: string): Promise<string>;
}

// ─── App State ─────────────────────────────────────────────────

export type AppPhase = 'landing' | 'loading' | 'exploring';

export interface DataQualityIssue {
  column: string;
  type: 'high_nulls' | 'low_cardinality' | 'outliers' | 'type_mismatch';
  message: string;
  severity: 'info' | 'warning';
}

export interface AppState {
  phase: AppPhase;
  schema: TableSchema | null;
  dashboard: DashboardSpec | null;
  messages: ChatMessage[];
  dataQualityIssues: DataQualityIssue[];
  sqlPanelOpen: boolean;
  settingsOpen: boolean;
  isGenerating: boolean;
  error: string | null;
}

export type AppAction =
  | { type: 'SET_PHASE'; phase: AppPhase }
  | { type: 'SET_SCHEMA'; schema: TableSchema }
  | { type: 'SET_DASHBOARD'; dashboard: DashboardSpec }
  | { type: 'APPLY_PATCHES'; patches: PatchOp[] }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'SET_DATA_QUALITY'; issues: DataQualityIssue[] }
  | { type: 'TOGGLE_SQL_PANEL' }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'SET_GENERATING'; isGenerating: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };

// ─── Settings ──────────────────────────────────────────────────

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
