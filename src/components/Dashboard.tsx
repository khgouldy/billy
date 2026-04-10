import { useEffect, useRef, useState } from 'react';
import * as vg from '@uwdata/vgplot';
import { coordinator } from '@uwdata/mosaic-core';
import type { DashboardSpec, ChartSpec } from '../types';
import { SummaryStats } from './SummaryStats';

interface DashboardProps {
  spec: DashboardSpec;
  tableName: string;
}

function ChartCard({ chart, tableName, crossFilter }: { chart: ChartSpec; tableName: string; crossFilter: any }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showSQL, setShowSQL] = useState(false);
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
        // Create a temp view from the chart's SQL so Mosaic can query it
        const viewName = `_billy_${chart.id}`;
        await coordinator().query(
          `CREATE OR REPLACE TEMP VIEW "${viewName}" AS ${chart.sql}`,
          { type: 'exec' }
        );

        if (cancelled) return;

        const plotElement = buildPlot(chart, viewName, crossFilter);
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
  }, [chart, tableName, crossFilter]);

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

function buildPlot(chart: ChartSpec, viewName: string, crossFilter: any): HTMLElement {
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
  plotArgs.push(vg.width(450));
  plotArgs.push(vg.height(280));

  if (chart.colorColumn) {
    plotArgs.push(vg.colorLegend({ as: crossFilter }));
  }

  return vg.plot(...plotArgs);
}

export function Dashboard({ spec, tableName }: DashboardProps) {
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
            tableName={tableName}
            crossFilter={crossFilterRef.current}
          />
        ))}
      </div>
    </div>
  );
}
