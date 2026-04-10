import { useState, useEffect, useRef, useCallback } from 'react';
import { executeQuery } from '../services/duckdb';
import type { SummaryStat } from '../types';

interface SummaryStatsProps {
  stats: SummaryStat[];
}

interface StatValue {
  label: string;
  value: string;
  rawNumber: number | null;
  loading: boolean;
  error?: string;
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

function formatAnimatedValue(current: number, target: number, format?: string): string {
  // Use the same formatting logic, but for the animated value
  if (format) {
    if (format.includes('$')) {
      return '$' + Math.round(current).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    if (format.includes('%')) {
      return (current * 100).toFixed(1) + '%';
    }
    if (format.includes('.1f')) return current.toFixed(1);
    if (format.includes('.2f')) return current.toFixed(2);
  }
  if (Number.isInteger(target)) return Math.round(current).toLocaleString();
  return current.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Ease-out cubic: fast start, gentle landing */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function AnimatedNumber({ target, format }: { target: number; format?: string }) {
  const [display, setDisplay] = useState('0');
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const duration = 600;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = eased * target;
      setDisplay(formatAnimatedValue(current, target, format));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, format]);

  return <>{display}</>;
}

export function SummaryStats({ stats }: SummaryStatsProps) {
  const [values, setValues] = useState<StatValue[]>(
    stats.map(s => ({ label: s.label, value: '\u2014', rawNumber: null, loading: true }))
  );

  // Track which format string each stat uses so AnimatedNumber can format correctly
  const formatMap = useRef<Record<string, string | undefined>>({});
  for (const s of stats) {
    formatMap.current[s.label] = s.format ?? undefined;
  }

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      const results: StatValue[] = [];
      for (const stat of stats) {
        try {
          const res = await executeQuery(stat.sql);
          const row = res.rows[0];
          const val = row ? Object.values(row)[0] : null;
          const num = val !== null && val !== undefined ? Number(val) : null;
          results.push({
            label: stat.label,
            value: formatValue(val, stat.format),
            rawNumber: num !== null && !isNaN(num) ? num : null,
            loading: false,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[Billy] Stat "${stat.label}" failed:`, msg);
          results.push({ label: stat.label, value: 'Error', rawNumber: null, loading: false, error: msg });
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
        <div
          key={i}
          className="flex-shrink-0 card-entrance"
          style={{ animationDelay: `${i * 60}ms` }}
          title={stat.error || undefined}
        >
          <div className="text-xs text-slate-400 uppercase tracking-wider">{stat.label}</div>
          <div className={`text-lg font-semibold tabular-nums ${stat.error ? 'text-red-400 cursor-help' : 'text-slate-900'} ${stat.loading ? 'animate-pulse' : ''}`}>
            {stat.loading
              ? '...'
              : stat.rawNumber !== null
                ? <AnimatedNumber target={stat.rawNumber} format={formatMap.current[stat.label]} />
                : stat.value
            }
          </div>
        </div>
      ))}
    </div>
  );
}
