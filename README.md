# Billy

**Drop a file. Get a dashboard. Powered by AI, running in your browser.**

Billy is a browser-based analytics tool that turns flat data files into interactive, cross-filtered dashboards in seconds. Drag in a CSV, JSON, or Parquet file — an AI analyzes your schema and generates charts, summary statistics, and insights. Then refine the dashboard through conversation: ask for new charts, adjust existing ones, or explore your data with SQL.

Your **raw data never leaves the browser**. A full DuckDB SQL engine runs locally via WebAssembly, handling all data processing on your machine. Only lightweight schema metadata (column names, types, and basic statistics) is sent to your chosen AI provider to generate the dashboard. For fully offline analytics, connect a local [Ollama](https://ollama.ai) instance — zero network traffic, period.

## Features

- **Instant dashboards** — Drop a file and get 3-5 cross-filtered charts with summary stats in under 10 seconds
- **Conversational refinement** — Add, remove, or modify charts by chatting: *"break this down by region"* or *"add a scatter plot of price vs. rating"*
- **Local-first processing** — DuckDB WASM processes your data entirely in the browser. No uploads, no servers, no accounts
- **Multiple AI providers** — Anthropic (Claude), OpenAI, or Ollama for fully local/offline mode
- **Model chaining** — Optional two-stage pipeline: one model reasons about chart design, another writes optimized SQL
- **Self-correcting AI** — Invalid queries are automatically retried with error context, so you don't have to debug
- **Cross-filtered interactivity** — Select data in one chart and watch all others update instantly via Mosaic
- **SQL transparency** — View and edit the raw DuckDB query behind every chart. Open the SQL panel with `Cmd+S`
- **Data quality insights** — Flags high nulls, outliers, cardinality issues, and type mismatches in your schema
- **Command palette** — `Cmd+K` for quick navigation and dashboard generation shortcuts

## Quickstart

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- An API key from [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com), or a running [Ollama](https://ollama.ai) instance

### Install and run

```bash
git clone https://github.com/khgouldy/billy.git
cd billy
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), click the gear icon, and enter your API key. Then drop a file or try one of the built-in sample datasets:

| Dataset | Rows | Description |
|---------|------|-------------|
| Hollywood Movies | ~3.2k | Box office records — budgets, ratings, genres, worldwide gross |
| Global Seismic Events | ~3k | USGS earthquake data — magnitude, depth, coordinates |
| US Flight Delays | ~5k | Domestic flights — delays, distances, airport codes |

## Configuration

All settings are stored in your browser's `localStorage` and configured through the in-app settings panel (gear icon).

| Setting | Description | Default |
|---------|-------------|---------|
| **LLM Provider** | `anthropic`, `openai`, or `ollama` | `anthropic` |
| **API Key** | Your provider's API key (not needed for Ollama) | — |
| **Model** | Model identifier (e.g. `claude-sonnet-4-20250514`, `gpt-4o`) | `claude-sonnet-4-20250514` |
| **SQL Model** | Optional dedicated model for SQL generation. When set, enables model chaining | — |
| **Ollama URL** | Ollama server address | `http://localhost:11434` |
| **Data Quality** | `off`, `subtle`, or `verbose` — controls schema issue visibility | `subtle` |
| **Domain Context** | Free-text glossary for your data (e.g. *"ARR = annual recurring revenue"*) | — |

### Supported file formats

CSV, TSV, JSON, JSONL, and Parquet — up to 500 MB.

## How it works

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌────────────────┐
│  Drop file  │────▶│  DuckDB WASM │────▶│  AI generates │────▶│  Interactive   │
│  or sample  │     │  ingests data │     │  dashboard    │     │  dashboard     │
└─────────────┘     └──────────────┘     └───────────────┘     └────────────────┘
                          │                     │                       │
                    Runs locally in       Schema + stats          Cross-filtered
                    your browser          sent to LLM             Mosaic charts
                                                                       │
                                                                       ▼
                                                               ┌────────────────┐
                                                               │  Chat to       │
                                                               │  refine        │
                                                               └────────────────┘
```

1. **Ingestion** — DuckDB WASM loads your file in-browser, infers types, and computes column statistics
2. **Schema analysis** — Column metadata (names, types, cardinality, sample values) is assembled into a schema object
3. **Dashboard generation** — Your chosen AI model receives the schema and returns a `DashboardSpec`: chart types, SQL queries, and summary statistics
4. **Rendering** — Mosaic + vgplot render linked, cross-filtered visualizations from the DuckDB queries
5. **Refinement** — Chat messages are translated into patch operations (`add`, `remove`, `modify`) applied to the dashboard spec

### Model chaining (optional)

When a **SQL Model** is configured, Billy splits generation into two stages:

1. **Reasoning model** — Analyzes the schema and designs chart intents (what to show, which columns, what groupings)
2. **SQL writer model** — Translates each intent into an optimized DuckDB query (runs in parallel)

This separation produces better SQL because each model focuses on what it does best.

## Tech stack

| Layer | Technology |
|-------|-----------|
| **UI** | React 19, Tailwind CSS, Vite |
| **Data engine** | DuckDB WASM (WebAssembly) |
| **Visualization** | Mosaic + vgplot (cross-filtered, declarative) |
| **Data format** | Apache Arrow (columnar, zero-copy) |
| **AI** | Anthropic SDK, OpenAI SDK, Ollama |
| **Language** | TypeScript (strict mode) |

## Project structure

```
src/
├── App.tsx                  # Main app shell and orchestration
├── types/index.ts           # All TypeScript interfaces
├── hooks/
│   ├── useAppState.ts       # Redux-like state management (useReducer)
│   └── useSettings.ts       # localStorage-backed settings
├── services/
│   ├── duckdb.ts            # DuckDB init, data ingestion, query execution
│   └── llm/
│       ├── provider.ts      # Provider interface + self-correction wrapper
│       ├── anthropic.ts     # Anthropic (Claude) provider
│       ├── openai.ts        # OpenAI provider
│       ├── ollama.ts        # Ollama provider (local models)
│       ├── chain.ts         # Two-stage model chain
│       └── prompts.ts       # All prompt templates
└── components/
    ├── Landing.tsx           # Drag-and-drop file upload + sample datasets
    ├── Dashboard.tsx         # Mosaic chart rendering + cross-filtering
    ├── ChatPanel.tsx         # Conversational refinement interface
    ├── SqlPanel.tsx          # Raw SQL query editor
    ├── SchemaPanel.tsx       # Column metadata sidebar
    ├── Settings.tsx          # API key and model configuration
    ├── CommandPalette.tsx    # Cmd+K command interface
    ├── SummaryStats.tsx      # KPI cards display
    └── ...                   # Header, DataPreview, Sparkline, SqlHighlight, etc.
```

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open command palette |
| `Cmd+S` | Toggle SQL panel |

## Development

```bash
npm run dev       # Start dev server with hot reload
npm run build     # Type-check + production build
npm run lint      # Run ESLint
npm run preview   # Preview production build locally
```

### Debug mode

Enable verbose logging to the browser console:

```js
localStorage.setItem('billy_debug', 'true')
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture details, and contribution guidelines.

---

<p align="center">
  Made on Earth by <a href="https://github.com/khgouldy">Par 72</a>
</p>
