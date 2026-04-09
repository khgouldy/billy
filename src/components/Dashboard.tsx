import { useEffect, useRef, useState } from 'react';
import * as vg from '@uwdata/vgplot';
import type { DashboardSpec, ChartSpec } from '../types';
import { SummaryStats } from './SummaryStats';

interface DashboardProps {
  spec: DashboardSpec;
}

function ChartCard({ chart, crossFilter }: { chart: ChartSpec; crossFilter: any }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSQL, setShowSQL] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }
    setError(null);

    try {
      const plotElement = buildPlot(chart, crossFilter);
      containerRef.current.appendChild(plotElement);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }

    return () => {
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
    };
  }, [chart, crossFilter]);

  return (
    <div className="chart-card bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-medium text-slate-800">{chart.title}</h3>
          {chart.description && (
            <p className="text-xs text-slate-400 mt-0.5">{chart.description}</p>
          )}
        </div>
        <button
          onClick={() => setShowSQL(!showSQL)}
          className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-50"
        >
          {showSQL ? 'Hide SQL' : 'SQL'}
        </button>
      </div>

      {showSQL && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
          <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap overflow-x-auto">
            {chart.sql}
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

function buildPlot(chart: ChartSpec, crossFilter: any): HTMLElement {
  const source = vg.from(chart.sql, { filterBy: crossFilter });

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
      mark = vg.rectY(
        vg.from(chart.sql, { filterBy: crossFilter }),
        { x: vg.bin(chart.xColumn), y: vg.count(), fill: 'steelblue', tip: true }
      );
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
  plotArgs.push(vg.width(450));
  plotArgs.push(vg.height(280));

  if (chart.colorColumn) {
    plotArgs.push(vg.colorLegend({ as: crossFilter }));
  }

  return vg.plot(...plotArgs);
}

export function Dashboard({ spec }: DashboardProps) {
  const crossFilterRef = useRef<any>(null);
  if (!crossFilterRef.current) {
    crossFilterRef.current = vg.Selection.crossfilter();
  }

  return (
    <div className="flex-1 overflow-auto p-4 bg-slate-50">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">{spec.title}</h1>
        {spec.description && (
          <p className="text-sm text-slate-500 mt-1">{spec.description}</p>
        )}
      </div>

      {spec.summaryStats && spec.summaryStats.length > 0 && (
        <SummaryStats stats={spec.summaryStats} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {spec.charts.map(chart => (
          <ChartCard
            key={chart.id}
            chart={chart}
            crossFilter={crossFilterRef.current}
          />
        ))}
      </div>
    </div>
  );
}
