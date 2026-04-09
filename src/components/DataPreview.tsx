import { useState, useEffect } from 'react';
import { executeQuery, getPreviewQuery } from '../services/duckdb';

interface DataPreviewProps {
  tableName: string;
}

export function DataPreview({ tableName }: DataPreviewProps) {
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await executeQuery(getPreviewQuery(tableName));
        if (!cancelled) {
          setColumns(result.columns);
          setRows(result.rows);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [tableName]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const sortedRows = sortCol
    ? [...rows].sort((a, b) => {
        const va = a[sortCol];
        const vb = b[sortCol];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortAsc ? va - vb : vb - va;
        }
        const sa = String(va);
        const sb = String(vb);
        return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
      })
    : rows;

  if (error) {
    return <div className="p-4 text-red-600 text-sm">{error}</div>;
  }

  return (
    <div className="overflow-auto max-h-64 border-t border-slate-200">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            {columns.map(col => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                className="px-3 py-2 text-left text-slate-500 font-mono font-medium cursor-pointer hover:text-slate-800 whitespace-nowrap border-b border-slate-200"
              >
                {col}
                {sortCol === col && (
                  <span className="ml-1 text-blue-500">
                    {sortAsc ? '\u2191' : '\u2193'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 border-b border-slate-100">
              {columns.map(col => (
                <td
                  key={col}
                  className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[200px] truncate"
                  title={String(row[col] ?? '')}
                >
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
    </div>
  );
}
