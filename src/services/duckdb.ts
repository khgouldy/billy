import { coordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core';
import { loadCSV, loadJSON, loadParquet } from '@uwdata/mosaic-sql';
import type { ColumnInfo, TableSchema, DataQualityIssue } from '../types';

/** Enable debug logging with: localStorage.setItem('billy_debug', 'true') in browser console */
function isDebug(): boolean {
  try { return localStorage.getItem('billy_debug') === 'true'; } catch { return false; }
}

function debug(msg: string, ...args: unknown[]): void {
  if (isDebug()) console.log(`%c[Billy] ${msg}`, 'color: #6366f1; font-weight: bold', ...args);
}

function debugTime(label: string): () => void {
  if (!isDebug()) return () => {};
  const start = performance.now();
  debug(`⏱ ${label} — started`);
  return () => debug(`⏱ ${label} — ${Math.round(performance.now() - start)}ms`);
}

let initialized = false;
let wasm: DuckDBWASMConnector | null = null;

export async function initDuckDB(): Promise<void> {
  if (initialized) { debug('DuckDB already initialized'); return; }

  const done = debugTime('initDuckDB');
  wasm = new DuckDBWASMConnector();
  coordinator().databaseConnector(wasm);
  initialized = true;
  done();
}

/** Run SQL through the Mosaic coordinator and get back row objects. */
export async function executeQuery(sql: string): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}> {
  await initDuckDB();
  debug('executeQuery:', sql.slice(0, 120) + (sql.length > 120 ? '…' : ''));
  const start = performance.now();
  const result = await coordinator().query(sql, { type: 'json' });
  const executionTime = Math.round(performance.now() - start);

  const rows = Array.isArray(result) ? result : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  debug(`executeQuery result: ${rows.length} rows, ${executionTime}ms`);

  return { columns, rows, rowCount: rows.length, executionTime };
}

/** Run SQL without returning results (DDL, data loading, etc.) */
async function runExec(sql: string): Promise<void> {
  await initDuckDB();
  await coordinator().query(sql, { type: 'exec' });
}

function sanitizeTableName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]/, '_$&')
    .toLowerCase();
}

function detectFileType(fileName: string): 'csv' | 'tsv' | 'json' | 'parquet' {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'parquet' || ext === 'pq') return 'parquet';
  if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') return 'json';
  if (ext === 'tsv' || ext === 'tab') return 'tsv';
  return 'csv';
}

export async function ingestFile(file: File): Promise<TableSchema> {
  debug(`ingestFile: ${file.name} (${file.size} bytes)`);
  await initDuckDB();

  const tableName = sanitizeTableName(file.name);
  const fileType = detectFileType(file.name);

  // Register file buffer with the DuckDB WASM instance
  const buffer = new Uint8Array(await file.arrayBuffer());
  const db = await wasm!.getDuckDB();
  if (db && typeof db.registerFileBuffer === 'function') {
    await db.registerFileBuffer(file.name, buffer);
  }

  // Load into DuckDB using Mosaic SQL helpers
  let loadStmt: any;
  switch (fileType) {
    case 'parquet':
      loadStmt = loadParquet(tableName, file.name);
      break;
    case 'json':
      loadStmt = loadJSON(tableName, file.name);
      break;
    case 'tsv':
      loadStmt = loadCSV(tableName, file.name, { delim: '\t' });
      break;
    case 'csv':
    default:
      loadStmt = loadCSV(tableName, file.name);
      break;
  }

  // Convert the SQL AST object to a string and execute
  const loadSQL = String(loadStmt);
  await runExec(loadSQL);

  return computeSchema(tableName, file.name);
}

/** Load a file from a URL (for sample datasets) */
export async function ingestURL(
  url: string,
  tableName: string,
  fileType: 'csv' | 'json' | 'parquet',
): Promise<TableSchema> {
  await initDuckDB();

  // Fetch the data with a timeout to avoid eternal spinners
  let fetchDone = debugTime(`fetch ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timeout);
    throw new Error(`Network error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  clearTimeout(timeout);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  fetchDone();
  debug(`Fetched ${buffer.byteLength} bytes for ${tableName}`);

  // Get the DuckDB instance from the connector and register the file
  const regDone = debugTime('registerFileBuffer');
  const db = await wasm!.getDuckDB();
  const fileName = `${tableName}.${fileType}`;
  if (db && typeof db.registerFileBuffer === 'function') {
    await db.registerFileBuffer(fileName, buffer);
  } else {
    console.warn('[Billy] registerFileBuffer not available — DuckDB may fail to load the file');
  }
  regDone();

  let loadStmt: any;
  switch (fileType) {
    case 'parquet':
      loadStmt = loadParquet(tableName, fileName);
      break;
    case 'json':
      loadStmt = loadJSON(tableName, fileName);
      break;
    case 'csv':
    default:
      loadStmt = loadCSV(tableName, fileName);
      break;
  }

  const loadSQL = String(loadStmt);
  const loadDone = debugTime(`load SQL: ${loadSQL.slice(0, 80)}`);
  await runExec(loadSQL);
  loadDone();

  const schemaDone = debugTime('computeSchema');
  const schema = await computeSchema(tableName, `${tableName}.${fileType}`);
  schemaDone();
  return schema;
}

async function computeSchema(
  tableName: string,
  fileName: string,
): Promise<TableSchema> {
  // Run schema, count, and sample rows in parallel — 3 queries instead of N*4+3
  const [countResult, schemaResult, sampleRowsResult] = await Promise.all([
    executeQuery(`SELECT COUNT(*) as cnt FROM "${tableName}"`),
    executeQuery(`DESCRIBE "${tableName}"`),
    executeQuery(`SELECT * FROM "${tableName}" LIMIT 5`),
  ]);

  const rowCount = Number(countResult.rows[0]?.cnt ?? 0);

  // Build a single batched stats query for ALL columns using UNION ALL
  const colMeta = schemaResult.rows.map((row) => ({
    name: String(row.column_name),
    type: String(row.column_type),
    nullable: row.null !== 'NO',
  }));

  const statsUnions = colMeta.map((col) => {
    const escaped = col.name.replace(/"/g, '""');
    return `SELECT
      '${col.name.replace(/'/g, "''")}' as col_name,
      COUNT(DISTINCT "${escaped}") as distinct_count,
      COUNT(*) FILTER (WHERE "${escaped}" IS NULL) as null_count,
      MIN("${escaped}")::VARCHAR as min_val,
      MAX("${escaped}")::VARCHAR as max_val
    FROM "${tableName}"`;
  });

  const sampleUnions = colMeta.map((col) => {
    const escaped = col.name.replace(/"/g, '""');
    return `SELECT
      '${col.name.replace(/'/g, "''")}' as col_name,
      "${escaped}"::VARCHAR as val
    FROM (
      SELECT DISTINCT "${escaped}" FROM "${tableName}"
      WHERE "${escaped}" IS NOT NULL LIMIT 5
    )`;
  });

  // Two batched queries: one for stats, one for sample values
  const [allStats, allSamples] = await Promise.all([
    colMeta.length > 0
      ? executeQuery(statsUnions.join('\nUNION ALL\n'))
      : Promise.resolve({ columns: [], rows: [], rowCount: 0, executionTime: 0 }),
    colMeta.length > 0
      ? executeQuery(sampleUnions.join('\nUNION ALL\n'))
      : Promise.resolve({ columns: [], rows: [], rowCount: 0, executionTime: 0 }),
  ]);

  // Index results by column name for O(1) lookups
  const statsMap = new Map<string, Record<string, unknown>>();
  for (const row of allStats.rows) {
    statsMap.set(String(row.col_name), row);
  }

  const samplesMap = new Map<string, unknown[]>();
  for (const row of allSamples.rows) {
    const name = String(row.col_name);
    if (!samplesMap.has(name)) samplesMap.set(name, []);
    samplesMap.get(name)!.push(row.val);
  }

  const columns: ColumnInfo[] = colMeta.map((col) => {
    const stats = statsMap.get(col.name) || {};
    const distinctCount = Number(stats.distinct_count ?? 0);
    const nullCount = Number(stats.null_count ?? 0);

    return {
      name: col.name,
      type: col.type,
      nullable: col.nullable,
      distinctCount,
      nullCount,
      nullPercent: rowCount > 0 ? Math.round((nullCount / rowCount) * 100) : 0,
      sampleValues: samplesMap.get(col.name) || [],
      min: stats.min_val ?? null,
      max: stats.max_val ?? null,
    };
  });

  return {
    tableName,
    fileName,
    rowCount,
    columns,
    sampleRows: sampleRowsResult.rows,
  };
}

export function detectDataQualityIssues(
  schema: TableSchema,
  level: 'off' | 'subtle' | 'verbose' = 'subtle',
): DataQualityIssue[] {
  if (level === 'off') return [];

  const issues: DataQualityIssue[] = [];

  for (const col of schema.columns) {
    if (col.nullPercent > 20) {
      issues.push({
        column: col.name,
        type: 'high_nulls',
        message: `${col.nullPercent}% null values`,
        severity: col.nullPercent > 50 ? 'warning' : 'info',
      });
    }

    if (
      level === 'verbose' &&
      isNumericType(col.type) &&
      col.distinctCount <= 5 &&
      col.distinctCount > 0
    ) {
      issues.push({
        column: col.name,
        type: 'low_cardinality',
        message: `Only ${col.distinctCount} distinct values — might be categorical`,
        severity: 'info',
      });
    }
  }

  return issues;
}

function isNumericType(type: string): boolean {
  const numericTypes = [
    'INTEGER', 'BIGINT', 'FLOAT', 'DOUBLE', 'DECIMAL',
    'SMALLINT', 'TINYINT', 'HUGEINT',
  ];
  return numericTypes.some((t) => type.toUpperCase().includes(t));
}

export function getPreviewQuery(tableName: string, limit = 100): string {
  return `SELECT * FROM "${tableName}" LIMIT ${limit}`;
}

export { isNumericType };

function isDateType(type: string): boolean {
  const t = type.toUpperCase();
  return t.includes('DATE') || t.includes('TIME') || t.includes('TIMESTAMP');
}

export type SparklineData = { label: string; value: number }[];

/**
 * Compute sparkline distribution data for a column.
 * Returns an array of { label, value } pairs suitable for a mini bar chart.
 */
export async function computeSparkline(
  tableName: string,
  colName: string,
  colType: string,
): Promise<SparklineData> {
  const escaped = colName.replace(/"/g, '""');

  if (isNumericType(colType)) {
    // Histogram: 10 equal-width bins
    const result = await executeQuery(`
      WITH bounds AS (
        SELECT MIN("${escaped}") AS lo, MAX("${escaped}") AS hi
        FROM "${tableName}"
        WHERE "${escaped}" IS NOT NULL
      ),
      binned AS (
        SELECT
          CASE WHEN hi = lo THEN 0
               ELSE LEAST(FLOOR(("${escaped}" - lo) / NULLIF((hi - lo), 0) * 10), 9)
          END::INT AS bin
        FROM "${tableName}", bounds
        WHERE "${escaped}" IS NOT NULL
      )
      SELECT bin AS label, COUNT(*)::INT AS value
      FROM binned
      GROUP BY bin
      ORDER BY bin
    `);
    // Fill in any missing bins
    const bins = new Map<number, number>();
    for (const row of result.rows) bins.set(Number(row.label), Number(row.value));
    return Array.from({ length: 10 }, (_, i) => ({
      label: String(i),
      value: bins.get(i) || 0,
    }));
  }

  if (isDateType(colType)) {
    // Timeline: 10 time buckets
    const result = await executeQuery(`
      WITH bounds AS (
        SELECT MIN("${escaped}") AS lo, MAX("${escaped}") AS hi
        FROM "${tableName}"
        WHERE "${escaped}" IS NOT NULL
      ),
      binned AS (
        SELECT
          CASE WHEN hi = lo THEN 0
               ELSE LEAST(FLOOR(EPOCH("${escaped}" - lo) / NULLIF(EPOCH(hi - lo), 0) * 10), 9)
          END::INT AS bin
        FROM "${tableName}", bounds
        WHERE "${escaped}" IS NOT NULL
      )
      SELECT bin AS label, COUNT(*)::INT AS value
      FROM binned
      GROUP BY bin
      ORDER BY bin
    `);
    const bins = new Map<number, number>();
    for (const row of result.rows) bins.set(Number(row.label), Number(row.value));
    return Array.from({ length: 10 }, (_, i) => ({
      label: String(i),
      value: bins.get(i) || 0,
    }));
  }

  // Categorical: top 5 values by frequency
  const result = await executeQuery(`
    SELECT "${escaped}"::VARCHAR AS label, COUNT(*)::INT AS value
    FROM "${tableName}"
    WHERE "${escaped}" IS NOT NULL
    GROUP BY "${escaped}"
    ORDER BY value DESC
    LIMIT 5
  `);
  return result.rows.map(r => ({
    label: String(r.label),
    value: Number(r.value),
  }));
}
