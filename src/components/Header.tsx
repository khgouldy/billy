interface HeaderProps {
  hasData: boolean;
  onSettings: () => void;
  onReset: () => void;
  fileName?: string;
}

export function Header({ hasData, onSettings, onReset, fileName }: HeaderProps) {
  return (
    <header className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onReset}
          className="text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors"
        >
          Billy
        </button>
        {fileName && (
          <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
            {fileName}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {hasData && (
          <div className="text-xs text-slate-400 mr-2">
            <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-500 border border-slate-200">⌘S</kbd> SQL
            <span className="mx-1.5">·</span>
            <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-500 border border-slate-200">⌘K</kbd> Commands
          </div>
        )}
        <button
          onClick={onSettings}
          className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
          title="Settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
