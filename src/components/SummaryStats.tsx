import { useState, useEffect } from 'react';
import { executeQuery } from '../services/duckdb';
import type { SummaryStat } from '../types';

interface SummaryStatsProps {
  stats: SummaryStat[];
}

interface StatValue {
  label: string;
  value: string;
  loading: boolean;
}

function formatValue(raw: unknown, format?: string): string {
  if (raw === null || raw === undefined) return '\u2014';
  const num = Number(raw);
  if (isNaN(num)) return String(raw);

  if (format) {
    if (format.includes('$')) {
      return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    if (format.includes('%')) {
      return (num * 100).toFixed(1) + '%';
    }
    if (format.includes('.1f')) return num.toFixed(1);
    if (format.includes('.2f')) return num.toFixed(2);
  }

  if (Number.isInteger(num)) return num.toLocaleString();
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function SummaryStats({ stats }: SummaryStatsProps) {
  const [values, setValues] = useState<StatValue[]>(
    stats.map(s => ({ label: s.label, value: '\u2014', loading: true }))
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      const results: StatValue[] = [];
      for (const stat of stats) {
        try {
          const res = await executeQuery(stat.sql);
          const row = res.rows[0];
          const val = row ? Object.values(row)[0] : null;
          results.push({ label: stat.label, value: formatValue(val, stat.format), loading: false });
        } catch {
          results.push({ label: stat.label, value: 'Error', loading: false });
        }
      }
      if (!cancelled) setValues(results);
    }

    loadStats();
    return () => { cancelled = true; };
  }, [stats]);

  if (values.length === 0) return null;

  return (
    <div className="flex gap-6 px-4 py-3 bg-white border border-slate-200 rounded-lg overflow-x-auto shadow-sm">
      {values.map((stat, i) => (
        <div key={i} className="flex-shrink-0">
          <div className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</div>
          <div className={`text-lg font-semibold text-slate-900 ${stat.loading ? 'animate-pulse' : ''}`}>
            {stat.loading ? '...' : stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
