import type { AppSettings } from '../types';

interface SettingsProps {
  settings: AppSettings;
  onUpdate: (updates: Partial<AppSettings>) => void;
  onClose: () => void;
}

const MODELS: Record<string, { label: string; value: string }[]> = {
  anthropic: [
    { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
  ],
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4.1', value: 'gpt-4.1' },
    { label: 'GPT-4.1 Mini', value: 'gpt-4.1-mini' },
  ],
};

export function Settings({ settings, onUpdate, onClose }: SettingsProps) {
  const handleProviderChange = (provider: string) => {
    const defaultModel = MODELS[provider]?.[0]?.value || '';
    onUpdate({ llmProvider: provider as AppSettings['llmProvider'], model: defaultModel });
  };

  const models = MODELS[settings.llmProvider] || [];

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">
            &times;
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Provider */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              LLM Provider
            </label>
            <select
              value={settings.llmProvider}
              onChange={e => handleProviderChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-300"
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {settings.llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key
            </label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={e => onUpdate({ apiKey: e.target.value })}
              placeholder={settings.llmProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
            />
            <p className="text-xs text-slate-400 mt-1">
              Stored in your browser's localStorage. Never sent anywhere except the provider's API.
            </p>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Model</label>
            <select
              value={settings.model}
              onChange={e => onUpdate({ model: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-300"
            >
              {models.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Data Quality */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Data Quality Callouts
            </label>
            <select
              value={settings.dataQualityLevel}
              onChange={e => onUpdate({ dataQualityLevel: e.target.value as AppSettings['dataQualityLevel'] })}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-300"
            >
              <option value="off">Off</option>
              <option value="subtle">Subtle (high nulls, obvious issues)</option>
              <option value="verbose">Verbose (all observations)</option>
            </select>
          </div>

          {/* Domain Context */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Domain Context
            </label>
            <textarea
              value={settings.domainContext}
              onChange={e => onUpdate({ domainContext: e.target.value })}
              placeholder='e.g., "Revenue excludes refunds. Fill rate = filled / headcount. Rating scale is 1-5."'
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:border-blue-300"
            />
            <p className="text-xs text-slate-400 mt-1">
              Business definitions and context. The AI uses this to build more accurate dashboards.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
