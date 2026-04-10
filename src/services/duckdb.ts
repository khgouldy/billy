import { coordinator, DuckDBWASMConnector } from '@uwdata/mosaic-core';
import { loadCSV, loadJSON, loadParquet } from '@uwdata/mosaic-sql';
import type { ColumnInfo, TableSchema, DataQualityIssue } from '../types';

let initialized = false;
let wasm: DuckDBWASMConnector | null = null;

export async function initDuckDB(): Promise<void> {
  if (initialized) return;

  wasm = new DuckDBWASMConnector();
  coordinator().databaseConnector(wasm);
  initialized = true;
}

/** Run SQL through the Mosaic coordinator and get back row objects. */
export async function executeQuery(sql: string): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}> {
  await initDuckDB();
  const start = performance.now();
  const result = await coordinator().query(sql, { type: 'json' });
  const executionTime = Math.round(performance.now() - start);

  const rows = Array.isArray(result) ? result : [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

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

  // Fetch the data and register as a file buffer, then load
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  const buffer = new Uint8Array(await response.arrayBuffer());

  // Get the DuckDB instance from the connector and register the file
  const db = await wasm!.getDuckDB();
  const fileName = `${tableName}.${fileType}`;
  if (db && typeof db.registerFileBuffer === 'function') {
    await db.registerFileBuffer(fileName, buffer);
  }

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
  await runExec(loadSQL);

  return computeSchema(tableName, `${tableName}.${fileType}`);
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
