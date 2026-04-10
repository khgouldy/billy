# Contributing to Billy

Thanks for your interest in contributing! Billy is an early-stage project and contributions of all kinds are welcome — bug reports, feature ideas, documentation, and code.

## Getting started

```bash
git clone https://github.com/khgouldy/billy.git
cd billy
npm install
npm run dev
```

The dev server starts at [http://localhost:5173](http://localhost:5173) with hot module replacement.

## Architecture overview

Billy follows a straightforward data flow:

```
File → DuckDB WASM → Schema → LLM → DashboardSpec → Mosaic/vgplot → Interactive Charts
                                                          ↑
                                              Chat → PatchOps ─┘
```

### Key concepts

- **`DashboardSpec`** — The central data structure. A JSON object describing charts, SQL queries, and summary stats. The entire dashboard is a function of this spec.
- **`PatchOp`** — Incremental operations (`add`, `remove`, `modify`, `addStat`, `removeStat`, `replaceAll`) applied to a `DashboardSpec`. Chat refinements produce patches, not full replacements.
- **`LLMProvider`** — Interface that all AI providers implement. Defines `generateDashboard()` and `refineDashboard()`.
- **`RawCompletionProvider`** — Simpler interface for prompt-in/text-out completions, used by model chaining.
- **Self-correction wrapper** — Wraps any provider with retry logic. On failure, feeds the error back to the model for a second attempt (up to 2 retries).

### Directory layout

| Directory | Purpose |
|-----------|---------|
| `src/types/` | All TypeScript interfaces — start here to understand the data model |
| `src/hooks/` | React state management (`useAppState`) and settings (`useSettings`) |
| `src/services/duckdb.ts` | DuckDB WASM initialization, file ingestion, query execution |
| `src/services/llm/` | LLM provider implementations, prompts, model chaining |
| `src/components/` | React UI components |

### Adding a new LLM provider

1. Create `src/services/llm/yourprovider.ts`
2. Implement the `LLMProvider` interface (and optionally `RawCompletionProvider`)
3. Wire it into the provider factory in `App.tsx`
4. Add the provider option to `Settings.tsx`

### Adding a new chart type

1. Add the type to the `ChartType` union in `src/types/index.ts`
2. Add rendering logic in `Dashboard.tsx`
3. Update the prompt templates in `src/services/llm/prompts.ts` so the AI knows the new type exists

## Code style

- **TypeScript strict mode** — No `any`, no unused variables or parameters
- **React hooks** — Functional components with hooks, no class components
- **Tailwind CSS** — Utility-first styling, custom `bench-*` color palette
- **ESLint** — Run `npm run lint` before submitting. The config enforces strict rules.

## Submitting changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run lint` and `npm run build` to verify everything passes
4. Open a pull request with a clear description of what changed and why

## Reporting bugs

Open an issue on GitHub with:
- What you did (file type, size, provider used)
- What you expected
- What actually happened
- Browser and OS

## Ideas and feature requests

Open an issue tagged `enhancement`. Describe the use case — what are you trying to accomplish? This helps us understand whether the feature fits Billy's direction.
