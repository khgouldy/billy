import type { TableSchema, DataQualityIssue } from '../types';

interface SchemaPanelProps {
  schema: TableSchema;
  dataQualityIssues: DataQualityIssue[];
}

function typeColor(type: string): string {
  const t = type.toUpperCase();
  if (t.includes('INT') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('DECIMAL'))
    return 'text-emerald-600';
  if (t.includes('VARCHAR') || t.includes('TEXT') || t.includes('STRING'))
    return 'text-amber-600';
  if (t.includes('DATE') || t.includes('TIME') || t.includes('TIMESTAMP'))
    return 'text-blue-600';
  if (t.includes('BOOL'))
    return 'text-purple-600';
  return 'text-slate-500';
}

function formatCardinality(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function SchemaPanel({ schema, dataQualityIssues }: SchemaPanelProps) {
  const issuesByColumn = new Map<string, DataQualityIssue[]>();
  for (const issue of dataQualityIssues) {
    const arr = issuesByColumn.get(issue.column) || [];
    arr.push(issue);
    issuesByColumn.set(issue.column, arr);
  }

  return (
    <div className="w-72 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Schema
        </h2>
        <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
          <span className="font-mono text-slate-600">{schema.tableName}</span>
          <span>{schema.rowCount.toLocaleString()} rows</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {schema.columns.map(col => {
          const issues = issuesByColumn.get(col.name) || [];
          return (
            <div key={col.name} className="p-2 rounded hover:bg-slate-50 group">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700 font-mono truncate" title={col.name}>
                  {col.name}
                </span>
                <span className={`text-xs font-mono ${typeColor(col.type)}`}>
                  {col.type}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                <span>{formatCardinality(col.distinctCount)} distinct</span>
                {col.nullPercent > 0 && (
                  <span className={col.nullPercent > 20 ? 'text-amber-600' : ''}>
                    {col.nullPercent}% null
                  </span>
                )}
              </div>
              {col.min !== null && col.min !== undefined && (
                <div className="text-xs text-slate-300 mt-0.5 truncate">
                  {String(col.min)} — {String(col.max)}
                </div>
              )}
              {issues.map((issue, i) => (
                <div
                  key={i}
                  className={`text-xs mt-1 px-1.5 py-0.5 rounded inline-block
                    ${issue.severity === 'warning'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                >
                  {issue.message}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
