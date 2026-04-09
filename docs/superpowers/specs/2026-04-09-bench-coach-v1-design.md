# Bench Coach V1 — Design Spec

**Date:** 2026-04-09
**Status:** Approved (via extensive brainstorming conversation)

## What It Is

Bench Coach is a local-first, open-source tool for building interactive cross-filtered dashboards from flat files. Drop a file, get an instant dashboard, refine it through conversation.

## Core Flow

1. **Landing** — Clean drop zone. "Try with sample data" option. LLM API key setup (localStorage).
2. **File Drop** — DuckDB WASM ingests file (<3s). Schema sidebar appears with column names, types, cardinality, min/max, sample values. Data preview table (first 100 rows, sortable) appears immediately.
3. **Instant Dashboard** — AI receives schema + column stats + 5 sample rows. Generates a dashboard spec (intermediate JSON format). Mosaic renders cross-filtered dashboard automatically. No conversation gate — dashboard appears first.
4. **Refinement** — Chat panel available for iterative refinement. AI patches the existing dashboard spec (add/remove/modify charts). AI suggests follow-up questions. Educational SQL callouts when interesting constructs are used.
5. **SQL Panel** — Cmd+S opens raw SQL panel. Execute DuckDB SQL against loaded tables. Results as sortable table.

## Architecture

```
Browser Tab
├── React Shell (Vite + Tailwind)
│   ├── Landing / Drop Zone
│   ├── Schema Sidebar
│   ├── Data Preview Table
│   ├── Dashboard (Mosaic vgplot)
│   ├── Chat Panel
│   └── SQL Panel
├── DuckDB WASM
│   ├── File ingestion (CSV, TSV, JSON, Parquet)
│   ├── Schema detection + column statistics
│   └── Query execution
├── Mosaic / vgplot
│   ├── Cross-filtered dashboard rendering
│   └── Selection/interaction handling
└── LLM Provider (configurable)
    ├── Dashboard spec generation
    ├── Spec patching (refinement)
    └── Follow-up suggestions
```

## Dashboard Spec Format (Option B — Intermediate JSON)

The AI generates a JSON spec. Bench Coach translates it to Mosaic vgplot calls. This decouples the AI from the viz library.

```typescript
interface DashboardSpec {
  title: string;
  description?: string;
  charts: ChartSpec[];
  summaryStats?: SummaryStat[];
}

interface ChartSpec {
  id: string;
  type: 'bar' | 'line' | 'area' | 'scatter' | 'histogram' | 'heatmap';
  title: string;
  description?: string;
  sql: string;           // DuckDB SQL that produces the data
  xColumn: string;       // column name for x-axis
  yColumn: string;       // column name for y-axis
  colorColumn?: string;  // optional color encoding
  mark?: string;         // Mosaic mark type override
}

interface SummaryStat {
  label: string;
  sql: string;           // SQL that returns a single value
  format?: string;       // number format (e.g., "$,.0f")
}
```

## Refinement: Patch Operations

When the user asks for changes, the AI returns patch operations, not a full spec:

```typescript
type PatchOp =
  | { op: 'add'; chart: ChartSpec }
  | { op: 'remove'; chartId: string }
  | { op: 'modify'; chartId: string; changes: Partial<ChartSpec> }
  | { op: 'addStat'; stat: SummaryStat }
  | { op: 'removeStat'; label: string };
```

## Key Decisions

- **Mosaic only** — no ReCharts. Mosaic for all charts including single views.
- **No Malloy in V1** — AI generates DuckDB SQL + Mosaic specs directly. Malloy is a V1.5 toggle.
- **Quick start is default** — instant dashboard, conversation for refinement only.
- **Single file in V1** — multi-file joins are V2.
- **No export in V1** — export/sharing is V2.
- **Cross-filter aggressiveness** — configurable setting with sensible default.
- **Data quality callouts** — configurable aggressiveness, subtle by default.
- **Domain glossary** — user-configurable JSON/markdown for domain context.

## Keyboard Shortcuts

- **Cmd+K** — Command palette
- **Cmd+S** — Toggle SQL panel
- **Cmd+E** — Toggle model/spec editor

## LLM Provider

Abstract interface, same pattern as ShiftQuery:

```typescript
interface LLMProvider {
  generateDashboard(schema: SchemaInfo, stats: ColumnStats[], sampleRows: any[]): Promise<DashboardSpec>;
  refineDashboard(currentSpec: DashboardSpec, userMessage: string, schema: SchemaInfo): Promise<PatchOp[]>;
  suggestFollowUps(currentSpec: DashboardSpec, schema: SchemaInfo): Promise<string[]>;
}
```

Anthropic is the default. Provider is swappable. API key stored in localStorage.

## Sample Datasets

Bundled for "Try with sample data" experience:
1. **USGS Earthquakes** — ~10k rows (subset), lat/lng, magnitude, depth, time. Globe-worthy.
2. **NASA Meteorite Landings** — ~45k rows, lat/lng, mass, class, fell/found. Tiny file, instant load.
3. **Olympic History** — ~271k rows, 120 years, sport/medal/country/decade.

## Data Quality Callouts

On ingest, surface notable data quality issues (configurable):
- High null percentage in columns (>20%)
- Extreme outliers in numeric columns
- Low-cardinality columns that might be boolean/enum
- Date parsing issues

Shown as subtle badges/tooltips in the schema sidebar, not modal alerts.

## Learning Features

- **View SQL** tab on every chart showing the DuckDB query
- **Educational callouts** when AI uses interesting SQL (window functions, CTEs, etc.)
- **Follow-up suggestions** after each AI response
- SQL panel for hands-on practice

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS |
| SQL Engine | DuckDB WASM (@duckdb/duckdb-wasm) |
| Visualization | Mosaic (@uwdata/mosaic-core, @uwdata/vgplot) |
| AI | Anthropic SDK (default), swappable |
| State | React context + useReducer |
| Storage | localStorage (API key, settings) |

## What's NOT in V1

- Malloy semantic layer (V1.5)
- Multi-file joins (V2)
- Export/sharing (V2)
- Reverse direction AI insights (V2)
- Schema diff on re-upload (future)
- "What's interesting?" button (future)
- Dashboard layout drag/resize (V2)
- Geographic/globe visualization (V2 — V1 uses standard charts only)
