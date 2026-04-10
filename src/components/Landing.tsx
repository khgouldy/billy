import { useState, useCallback, useRef } from 'react';

interface LandingProps {
  onFileSelect: (file: File) => void;
  onSampleData: (name: string) => void;
}

const SAMPLE_DATASETS = [
  {
    id: 'movies',
    name: 'Hollywood Movies',
    description: 'Box office records with budgets, ratings, genres, and worldwide gross revenue',
    rows: '~3.2k rows',
    icon: '\uD83C\uDFAC',
  },
  {
    id: 'earthquakes',
    name: 'Global Seismic Events',
    description: 'USGS earthquake records with magnitude, depth, and geographic coordinates',
    rows: '~3k rows',
    icon: '\uD83C\uDF0D',
  },
  {
    id: 'flights',
    name: 'US Flight Delays',
    description: 'Domestic flight records with delay times, distances, and airport codes',
    rows: '~5k rows',
    icon: '\u2708\uFE0F',
  },
];

export function Landing({ onFileSelect, onSampleData }: LandingProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);

  return (
    <div className="flex-1 flex items-center justify-center p-8 relative">
      {/* Animated gradient mesh background */}
      <div className="hero-mesh"><div className="mesh-blob" /></div>

      <div className="max-w-2xl w-full space-y-8 relative z-10">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
            Billy
          </h1>
          <p className="text-slate-500 text-lg max-w-md mx-auto">
            Drop a file. Get an interactive, cross-filtered dashboard. Refine it by conversation.
          </p>
          <p className="text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
            Powered by DuckDB WASM and Mosaic. Your data never leaves the browser &mdash; a full SQL analytics engine runs locally via WebAssembly, rendering linked visualizations that update in milliseconds. No server, no accounts, no setup.
          </p>
        </div>

        {/* Drop Zone */}
        <div
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
            transition-all duration-200
            ${isDragging
              ? 'border-blue-500 bg-blue-50 drop-zone-active'
              : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".csv,.tsv,.json,.jsonl,.parquet,.pq"
            onChange={handleFileInput}
          />
          <div className="space-y-3">
            <div className="text-4xl">
              {isDragging ? '\uD83D\uDCC2' : '\uD83D\uDCCA'}
            </div>
            <div>
              <p className="text-slate-700 font-medium">
                {isDragging ? 'Drop your file here' : 'Drag & drop a data file'}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                CSV, TSV, JSON, or Parquet &mdash; up to 500 MB
              </p>
            </div>
            <button className="text-blue-600 text-sm hover:text-blue-700 underline underline-offset-2">
              or click to browse
            </button>
          </div>
        </div>

        {/* Sample Datasets */}
        <div className="space-y-3">
          <p className="text-slate-400 text-sm text-center">
            Or explore with sample data
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SAMPLE_DATASETS.map(dataset => (
              <button
                key={dataset.id}
                onClick={() => onSampleData(dataset.id)}
                className="
                  text-left p-4 rounded-lg border border-slate-200
                  hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm
                  transition-all duration-200 group bg-white
                "
              >
                <div className="text-2xl mb-2">{dataset.icon}</div>
                <div className="text-sm font-medium text-slate-700 group-hover:text-blue-700">
                  {dataset.name}
                </div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {dataset.description}
                </div>
                <div className="text-xs text-slate-300 mt-1.5 font-mono">
                  {dataset.rows}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-slate-400 text-xs">
            Your data stays in your browser. Only schema + stats are sent to the AI.
          </p>
          <p className="text-slate-300 text-xs">
            Made on Earth by Par 72
          </p>
        </div>
      </div>
    </div>
  );
}
