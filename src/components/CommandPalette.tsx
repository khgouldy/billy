import { useState, useEffect, useRef, useMemo } from 'react';

export interface PaletteAction {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  onSelect: () => void;
}

interface CommandPaletteProps {
  actions: PaletteAction[];
  onClose: () => void;
}

/** Simple fuzzy match: checks if all query chars appear in order in the target */
function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for consecutive matches
      score += (ti === lastMatch + 1) ? 2 : 1;
      // Bonus for matching at word boundaries
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '_') score += 1;
      lastMatch = ti;
      qi++;
    }
  }

  return qi === q.length ? score : -1;
}

export function CommandPalette({ actions, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    return actions
      .map(a => ({ action: a, score: fuzzyScore(query, a.label) }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.action);
  }, [query, actions]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      filtered[selectedIndex].onSelect();
      onClose();
    }
  };

  // Group by section
  const sections = useMemo(() => {
    const map = new Map<string, PaletteAction[]>();
    for (const a of filtered) {
      const arr = map.get(a.section) || [];
      arr.push(a);
      map.set(a.section, arr);
    }
    return map;
  }, [filtered]);

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-50 backdrop-enter" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
      <div className="absolute inset-0 flex justify-center pt-[15vh]" onClick={e => e.stopPropagation()}>
        <div className="palette-enter bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden" style={{ maxHeight: '60vh' }}>
          {/* Search input */}
          <div className="px-4 py-3 border-b border-slate-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              className="w-full text-sm text-slate-700 placeholder-slate-400 outline-none bg-transparent"
              spellCheck={false}
            />
          </div>

          {/* Results */}
          <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 'calc(60vh - 52px)' }}>
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                No matching commands
              </div>
            ) : (
              Array.from(sections.entries()).map(([section, items]) => (
                <div key={section}>
                  <div className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {section}
                  </div>
                  {items.map(action => {
                    const idx = globalIndex++;
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={action.id}
                        onClick={() => { action.onSelect(); onClose(); }}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${
                          isSelected
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{action.label}</span>
                        {action.shortcut && (
                          <kbd className={`text-xs px-1.5 py-0.5 rounded border ${
                            isSelected
                              ? 'border-blue-200 text-blue-500 bg-blue-100/50'
                              : 'border-slate-200 text-slate-400 bg-slate-50'
                          }`}>
                            {action.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
