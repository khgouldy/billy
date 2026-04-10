import { useEffect, useRef, useState, useCallback } from 'react';
import * as vg from '@uwdata/vgplot';
import { coordinator } from '@uwdata/mosaic-core';
import type { DashboardSpec, ChartSpec, ChartType } from '../types';
import { SummaryStats } from './SummaryStats';
import { SqlHighlight } from './SqlHighlight';

interface DashboardProps {
  spec: DashboardSpec;
  tableName: string;
}

// ─── Chart type icons (tiny inline SVGs) ────────────────

const CHART_ICONS: Record<ChartType, string> = {
  bar: 'M4 20h4V10H4v10zm6 0h4V4h-4v16zm6 0h4v-8h-4v8z',
  barH: 'M4 4v4h10V4H4zm0 6v4h16v-4H4zm0 6v4h8v-4H4z',
  line: 'M3 17l4-4 4 4 4-8 4 4',
  area: 'M3 17l4-4 4 4 4-8 4 4V20H3z',
  scatter: 'M7 7a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm4-5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-8 6a1.5 1.5 0 110-3 1.5 1.5 0 010 3z',
  histogram: 'M3 20V14h3v6H3zm5 0V8h3v12H8zm5 0V11h3v9h-3zm5 0V5h3v15h-3z',
  heatmap: 'M3 3h4v4H3V3zm5 0h4v4H8V3zm5 0h4v4h-4V3zM3 8h4v4H3V8zm5 0h4v4H8V8zm5 0h4v4h-4V8zM3 13h4v4H3v-4zm5 0h4v4H8v-4zm5 0h4v4h-4v-4z',
};

function ChartTypeIcon({ type, active, onClick }: { type: ChartType; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={type}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-blue-100 text-blue-600'
          : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
      }`}
    >
      <svg className="w-3.5 h-3.5" fill={type === 'scatter' ? 'currentColor' : 'none'} stroke={type === 'scatter' ? 'none' : 'currentColor'} strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d={CHART_ICONS[type]} />
      </svg>
    </button>
  );
}

// ─── Determine compatible chart types ───────────────────

function getCompatibleTypes(chart: ChartSpec): ChartType[] {
  // Histograms are special — they use binning, so only compatible with themselves
  if (chart.type === 'histogram') return ['histogram'];
  // Heatmaps need two categoricals
  if (chart.type === 'heatmap') return ['heatmap', 'bar', 'barH'];

  const types: ChartType[] = ['bar', 'barH', 'line', 'area', 'scatter'];
  return types;
}

// ─── Chart renderer ─────────────────────────────────────

function useChartRenderer(
  chart: ChartSpec,
  crossFilter: any,
  containerRef: React.RefObject<HTMLDivElement | null>,
  size: { width: number; height: number },
) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }
    setError(null);

    (async () => {
      try {
        const viewName = `_billy_${chart.id}`;
        await coordinator().query(
          `CREATE OR REPLACE TEMP VIEW "${viewName}" AS ${chart.sql}`,
          { type: 'exec' }
        );
        if (cancelled) return;

        const plotElement = buildPlot(chart, viewName, crossFilter, size);
        containerRef.current?.appendChild(plotElement);
      } catch (e) {
        if (!cancelled) {
          setError(String(e instanceof Error ? e.message : e));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, [chart, crossFilter, size.width, size.height]);

  return error;
}

// ─── ChartCard ──────────────────────────────────────────

function ChartCard({
  chart,
  crossFilter,
  onExpand,
  onTypeChange,
}: {
  chart: ChartSpec;
  crossFilter: any;
  onExpand: () => void;
  onTypeChange: (type: ChartType) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSQL, setShowSQL] = useState(false);
  const size = { width: 450, height: 280 };
  const error = useChartRenderer(chart, crossFilter, containerRef, size);
  const compatibleTypes = getCompatibleTypes(chart);

  return (
    <div className="chart-card bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-slate-800 truncate">{chart.title}</h3>
          {chart.description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{chart.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {/* Chart type switcher */}
          {compatibleTypes.length > 1 && (
            <div className="flex items-center gap-0.5 mr-1 border-r border-slate-100 pr-2">
              {compatibleTypes.map(t => (
                <ChartTypeIcon
                  key={t}
                  type={t}
                  active={t === chart.type}
                  onClick={() => onTypeChange(t)}
                />
              ))}
            </div>
          )}
          <button
            onClick={() => setShowSQL(!showSQL)}
            className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-50"
          >
            {showSQL ? 'Hide' : 'SQL'}
          </button>
          <button
            onClick={onExpand}
            className="text-slate-300 hover:text-slate-600 p-1 rounded hover:bg-slate-50"
            title="Expand chart"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
            </svg>
          </button>
        </div>
      </div>

      {showSQL && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
            <SqlHighlight sql={chart.sql} />
          </pre>
        </div>
      )}

      <div className="p-4">
        {error ? (
          <div className="text-red-500 text-sm p-4 text-center">
            <p className="font-medium">Chart error</p>
            <p className="text-xs mt-1 text-red-400">{error}</p>
          </div>
        ) : (
          <div ref={containerRef} className="chart-container w-full min-h-[250px]" />
        )}
      </div>
    </div>
  );
}

// ─── Fullscreen Chart Modal ─────────────────────────────

function ExpandedChart({
  chart,
  crossFilter,
  onClose,
}: {
  chart: ChartSpec;
  crossFilter: any;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const size = { width: Math.min(window.innerWidth - 128, 1200), height: Math.min(window.innerHeight - 200, 600) };
  const error = useChartRenderer(chart, crossFilter, containerRef, size);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 backdrop-enter" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="absolute inset-0 flex items-center justify-center p-8" onClick={e => e.stopPropagation()}>
        <div className="modal-enter bg-white rounded-xl shadow-2xl max-w-[1280px] w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{chart.title}</h2>
              {chart.description && (
                <p className="text-sm text-slate-500 mt-0.5">{chart.description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Chart */}
          <div className="p-6">
            {error ? (
              <div className="text-red-500 text-sm p-8 text-center">
                <p className="font-medium">Chart error</p>
                <p className="text-xs mt-1 text-red-400">{error}</p>
              </div>
            ) : (
              <div ref={containerRef} className="w-full flex items-center justify-center" style={{ minHeight: size.height }} />
            )}
          </div>

          {/* SQL */}
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50">
            <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
              <SqlHighlight sql={chart.sql} />
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Build Plot ─────────────────────────────────────────

function buildPlot(
  chart: ChartSpec,
  viewName: string,
  crossFilter: any,
  size: { width: number; height: number },
): HTMLElement {
  const source = vg.from(viewName, { filterBy: crossFilter });

  let mark: any;
  let interactor: any;

  switch (chart.type) {
    case 'bar':
      mark = vg.barY(source, { x: chart.xColumn, y: chart.yColumn, fill: chart.colorColumn || 'steelblue', tip: true });
      interactor = vg.toggleX({ as: crossFilter });
      break;
    case 'barH':
      mark = vg.barX(source, { y: chart.xColumn, x: chart.yColumn, fill: chart.colorColumn || 'steelblue', tip: true });
      interactor = vg.toggleY({ as: crossFilter });
      break;
    case 'line':
      mark = vg.lineY(source, { x: chart.xColumn, y: chart.yColumn, stroke: chart.colorColumn || 'steelblue', tip: true });
      interactor = vg.intervalX({ as: crossFilter });
      break;
    case 'area':
      mark = vg.areaY(source, { x: chart.xColumn, y: chart.yColumn, fill: chart.colorColumn || 'steelblue', fillOpacity: 0.5, tip: true });
      interactor = vg.intervalX({ as: crossFilter });
      break;
    case 'scatter':
      mark = vg.dot(source, { x: chart.xColumn, y: chart.yColumn, fill: chart.colorColumn || 'steelblue', r: 3, tip: true });
      interactor = vg.intervalXY({ as: crossFilter });
      break;
    case 'histogram':
      mark = vg.rectY(source, { x: vg.bin(chart.xColumn), y: vg.count(), fill: 'steelblue', tip: true });
      interactor = vg.intervalX({ as: crossFilter });
      break;
    case 'heatmap':
      mark = vg.rect(source, { x: chart.xColumn, y: chart.yColumn, fill: vg.count(), tip: true });
      interactor = vg.toggleX({ as: crossFilter });
      break;
    default:
      mark = vg.barY(source, { x: chart.xColumn, y: chart.yColumn, fill: 'steelblue', tip: true });
      interactor = vg.toggleX({ as: crossFilter });
  }

  const plotArgs: any[] = [mark];
  if (interactor) plotArgs.push(interactor);
  plotArgs.push(vg.highlight({ by: crossFilter }));
  plotArgs.push(vg.width(size.width));
  plotArgs.push(vg.height(size.height));

  if (chart.colorColumn) {
    plotArgs.push(vg.colorLegend({ as: crossFilter }));
  }

  return vg.plot(...plotArgs);
}

// ─── Dashboard ──────────────────────────────────────────

export function Dashboard({ spec, tableName }: DashboardProps) {
  const crossFilterRef = useRef<any>(null);
  if (!crossFilterRef.current) {
    crossFilterRef.current = vg.Selection.crossfilter();
  }

  const [expandedChart, setExpandedChart] = useState<ChartSpec | null>(null);
  const [localCharts, setLocalCharts] = useState(spec.charts);

  // Sync when spec changes (new dashboard or AI refinement)
  useEffect(() => {
    setLocalCharts(spec.charts);
  }, [spec.charts]);

  const handleTypeChange = useCallback((chartId: string, newType: ChartType) => {
    setLocalCharts(prev => prev.map(c =>
      c.id === chartId ? { ...c, type: newType } : c
    ));
  }, []);

  return (
    <div className="flex-1 overflow-auto p-4 bg-slate-50">
      <div className="mb-4 card-entrance">
        <h1 className="text-xl font-bold text-slate-900">{spec.title}</h1>
        {spec.description && (
          <p className="text-sm text-slate-500 mt-1">{spec.description}</p>
        )}
      </div>

      {spec.summaryStats && spec.summaryStats.length > 0 && (
        <SummaryStats stats={spec.summaryStats} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {localCharts.map((chart, i) => (
          <div
            key={chart.id}
            className="card-entrance"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <ChartCard
              chart={chart}
              crossFilter={crossFilterRef.current}
              onExpand={() => setExpandedChart(chart)}
              onTypeChange={(type) => handleTypeChange(chart.id, type)}
            />
          </div>
        ))}
      </div>

      {expandedChart && (
        <ExpandedChart
          chart={expandedChart}
          crossFilter={crossFilterRef.current}
          onClose={() => setExpandedChart(null)}
        />
      )}
    </div>
  );
}
