import { useState, useCallback, useRef } from 'react';
import { executeQuery } from '../services/duckdb';

interface SqlPanelProps {
  tableName: string;
  onClose: () => void;
}

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
}

export function SqlPanel({ tableName, onClose }: SqlPanelProps) {
  const [sql, setSql] = useState(`SELECT * FROM "${tableName}" LIMIT 100`);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runQuery = useCallback(async () => {
    if (!sql.trim() || isRunning) return;
    setIsRunning(true);
    setError(null);

    try {
      const res = await executeQuery(sql);
      setResult(res);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  }, [sql, isRunning]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white flex flex-col" style={{ height: '40vh' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-700">SQL</h3>
          <button
            onClick={runQuery}
            disabled={isRunning}
            className="px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:opacity-50"
          >
            {isRunning ? 'Running...' : 'Run (\u2318\u21B5)'}
          </button>
          {result && (
            <span className="text-xs text-slate-400">
              {result.rowCount} rows in {result.executionTime}ms
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">
          \u00D7
        </button>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200">
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-20 bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm text-slate-700 font-mono resize-none focus:outline-none focus:border-blue-300"
            spellCheck={false}
          />
        </div>

        <div className="flex-1 overflow-auto">
          {error && (
            <div className="p-3 text-red-600 text-sm bg-red-50">{error}</div>
          )}

          {result && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  {result.columns.map(col => (
                    <th key={col} className="px-3 py-2 text-left text-slate-500 font-mono font-medium whitespace-nowrap border-b border-slate-200">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 border-b border-slate-100">
                    {result.columns.map(col => (
                      <td key={col} className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[200px] truncate" title={String(row[col] ?? '')}>
                        {row[col] === null || row[col] === undefined
                          ? <span className="text-slate-300 italic">null</span>
                          : String(row[col])
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
