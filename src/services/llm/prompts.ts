import type { TableSchema, DashboardSpec, ChatMessage, ChartType } from '../../types';

function describeSchema(schema: TableSchema): string {
  const lines = [
    `Table: "${schema.tableName}" (${schema.rowCount.toLocaleString()} rows, ${schema.columns.length} columns)`,
    '',
    'Columns:',
  ];

  for (const col of schema.columns) {
    let desc = `  - "${col.name}" (${col.type})`;
    desc += ` — ${col.distinctCount.toLocaleString()} distinct`;
    if (col.nullPercent > 0) desc += `, ${col.nullPercent}% null`;
    if (col.min !== null && col.min !== undefined) desc += `, range: ${col.min} to ${col.max}`;
    if (col.sampleValues.length > 0) {
      desc += `, samples: ${col.sampleValues.slice(0, 3).map(v => JSON.stringify(v)).join(', ')}`;
    }
    lines.push(desc);
  }

  lines.push('', 'Sample rows:');
  for (const row of schema.sampleRows.slice(0, 3)) {
    lines.push(`  ${JSON.stringify(row)}`);
  }

  return lines.join('\n');
}

export function buildGenerateDashboardPrompt(
  schema: TableSchema,
  domainContext?: string,
): string {
  return `You are Bench Coach, an expert data analyst and dashboard builder. You are given a data table's schema and statistics. Your job is to generate an instant, insightful dashboard specification.

## Data
${describeSchema(schema)}

${domainContext ? `## Domain Context\n${domainContext}\n` : ''}

## Task
Generate a dashboard specification as a JSON object. Create 3-5 charts that reveal the most interesting patterns in this data. Also include 2-4 summary statistics.

## Heuristics
- Numeric columns with high cardinality → measures (SUM, AVG, COUNT)
- String/categorical columns with low cardinality (< 30 distinct) → dimensions (group by)
- Date/timestamp columns → time dimensions (group by month or day)
- ID columns (unique count ≈ row count) → exclude from default views
- Columns with 2-5 distinct values → good for color encoding or filters
- Prefer a mix of chart types for visual variety
- Always include a time-series view if a date column exists
- DuckDB SQL dialect — use DuckDB functions (e.g., date_trunc, strftime)

## Chart Type Selection
- Bar/barH: categorical dimension × numeric measure
- Line: time dimension × numeric measure (trends)
- Scatter: two numeric measures (correlation)
- Histogram: distribution of a single numeric column
- Area: time dimension × numeric measure (cumulative or stacked)
- Heatmap: two categorical dimensions × numeric measure

## Output Format
Return ONLY a JSON object (no markdown fences, no explanation) matching this schema:
{
  "title": "string — descriptive dashboard title",
  "description": "string — one sentence describing what this dashboard explores",
  "charts": [
    {
      "id": "string — unique id like chart_1",
      "type": "bar | barH | line | area | scatter | histogram | heatmap",
      "title": "string — chart title",
      "description": "string — what this chart shows",
      "sql": "string — DuckDB SQL query that produces the data for this chart. Use the table name \\"${schema.tableName}\\". The query should return the columns referenced in xColumn and yColumn.",
      "xColumn": "string — column name in the query result for the x-axis",
      "yColumn": "string — column name in the query result for the y-axis",
      "colorColumn": "string | null — optional column for color encoding"
    }
  ],
  "summaryStats": [
    {
      "label": "string — stat label like 'Total Revenue'",
      "sql": "string — DuckDB SQL that returns a single row with a single column named 'value'",
      "format": "string | null — optional d3-format string like '$,.0f' or ',.0f'"
    }
  ]
}

IMPORTANT:
- All SQL must be valid DuckDB SQL.
- Each chart's SQL must be a complete, self-contained query.
- Use double quotes for column names if they contain spaces or special characters.
- The xColumn and yColumn must match column names in the SQL query's SELECT clause.
- For histograms, the SQL should return raw values (the binning will be done by the chart renderer). Set xColumn to the numeric column and yColumn to "count".
- For scatter plots, both xColumn and yColumn should be numeric aggregates.`;
}

export function buildRefinementPrompt(
  currentSpec: DashboardSpec,
  userMessage: string,
  schema: TableSchema,
  history: ChatMessage[],
  domainContext?: string,
): string {
  const recentHistory = history.slice(-10).map(m =>
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');

  return `You are Bench Coach, an expert data analyst helping a user refine their dashboard. The user has an existing dashboard and wants to modify it.

## Data Schema
${describeSchema(schema)}

${domainContext ? `## Domain Context\n${domainContext}\n` : ''}

## Current Dashboard
${JSON.stringify(currentSpec, null, 2)}

## Recent Conversation
${recentHistory}

## User Request
${userMessage}

## Task
Generate patch operations to modify the dashboard based on the user's request. Also provide:
1. A brief explanation of what you changed and why
2. 2-3 suggested follow-up questions the user might want to explore next
3. If you used an interesting SQL construct (window function, CTE, CASE expression, etc.), include a brief educational note explaining it

## Output Format
Return ONLY a JSON object (no markdown fences):
{
  "patches": [
    { "op": "add", "chart": { ... full ChartSpec ... } },
    { "op": "remove", "chartId": "chart_1" },
    { "op": "modify", "chartId": "chart_2", "changes": { "sql": "...", "title": "..." } }
  ],
  "explanation": "string — what was changed and why",
  "followUps": ["string — suggested follow-up question", ...],
  "educationalNote": "string | null — brief explanation of an interesting SQL concept used, if any"
}

IMPORTANT:
- Use "replaceAll" op with a full spec only if the user wants a completely different dashboard.
- Prefer small, targeted patches (add/remove/modify) over replaceAll.
- All SQL must be valid DuckDB SQL using table "${schema.tableName}".
- Keep explanations concise — 1-2 sentences.
- Follow-up questions should be specific to the data and current analysis, not generic.`;
}

const VALID_CHART_TYPES: ChartType[] = ['bar', 'barH', 'line', 'area', 'scatter', 'histogram', 'heatmap'];

export function validateDashboardSpec(spec: unknown): spec is DashboardSpec {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as Record<string, unknown>;
  if (typeof s.title !== 'string') return false;
  if (!Array.isArray(s.charts)) return false;

  for (const chart of s.charts) {
    if (typeof chart !== 'object' || !chart) return false;
    const c = chart as Record<string, unknown>;
    if (typeof c.id !== 'string') return false;
    if (!VALID_CHART_TYPES.includes(c.type as ChartType)) return false;
    if (typeof c.sql !== 'string') return false;
    if (typeof c.xColumn !== 'string') return false;
    if (typeof c.yColumn !== 'string') return false;
  }

  return true;
}
