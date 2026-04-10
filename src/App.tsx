import { useCallback, useEffect } from 'react';
import { useAppState } from './hooks/useAppState';
import { useSettings } from './hooks/useSettings';
import { ingestFile, ingestURL, detectDataQualityIssues } from './services/duckdb';
import { AnthropicProvider } from './services/llm/anthropic';
import { OpenAIProvider } from './services/llm/openai';
import { OllamaProvider } from './services/llm/ollama';
import { setLLMProvider, getLLMProvider, withSelfCorrection } from './services/llm/provider';
import type { ChatMessage } from './types';
import { Landing } from './components/Landing';
import { Header } from './components/Header';
import { SchemaPanel } from './components/SchemaPanel';
import { DataPreview } from './components/DataPreview';
import { Dashboard } from './components/Dashboard';
import { ChatPanel } from './components/ChatPanel';
import { SqlPanel } from './components/SqlPanel';
import { Settings } from './components/Settings';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function App() {
  const { state, actions } = useAppState();
  const { settings, updateSettings, saveError } = useSettings();

  // Initialize LLM provider when settings change
  useEffect(() => {
    if (settings.llmProvider === 'ollama') {
      setLLMProvider(withSelfCorrection(new OllamaProvider(settings.model, settings.ollamaUrl)));
    } else if (settings.apiKey) {
      if (settings.llmProvider === 'openai') {
        setLLMProvider(withSelfCorrection(new OpenAIProvider(settings.apiKey, settings.model)));
      } else {
        setLLMProvider(withSelfCorrection(new AnthropicProvider(settings.apiKey, settings.model)));
      }
    }
  }, [settings.apiKey, settings.model, settings.llmProvider, settings.ollamaUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && state.schema) {
        e.preventDefault();
        actions.toggleSqlPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.schema, actions]);

  const generateDashboard = useCallback(async (schema: any) => {
    const provider = getLLMProvider();
    if (!provider) {
      actions.setError('Set your API key in Settings to generate dashboards automatically.');
      return;
    }

    actions.setGenerating(true);
    try {
      const dashboard = await provider.generateDashboard(
        schema,
        settings.domainContext || undefined,
      );
      actions.setDashboard(dashboard);
    } catch (e) {
      actions.setError(
        `Dashboard generation failed: ${e instanceof Error ? e.message : String(e)}. You can still explore data via the SQL panel.`
      );
    } finally {
      actions.setGenerating(false);
    }
  }, [actions, settings]);

  // Handle file upload
  const handleFileSelect = useCallback(async (file: File) => {
    actions.setPhase('loading');
    actions.setError(null);

    try {
      const schema = await ingestFile(file);
      actions.setSchema(schema);
      actions.setDataQuality(detectDataQualityIssues(schema, settings.dataQualityLevel));
      actions.setPhase('exploring');
      await generateDashboard(schema);
    } catch (e) {
      actions.setError(`Failed to load file: ${e instanceof Error ? e.message : String(e)}`);
      actions.setPhase('landing');
    }
  }, [actions, settings, generateDashboard]);

  // Handle sample data
  const handleSampleData = useCallback(async (name: string) => {
    actions.setPhase('loading');
    actions.setError(null);

    try {
      const datasetConfig: Record<string, { url: string; table: string; type: 'csv' | 'json' | 'parquet' }> = {
        meteorites: {
          url: 'https://data.nasa.gov/resource/gh4g-9sfh.json?$limit=5000',
          table: 'meteorites',
          type: 'json',
        },
        earthquakes: {
          url: 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=2024-01-01&endtime=2025-01-01&minmagnitude=4.5&limit=3000',
          table: 'earthquakes',
          type: 'csv',
        },
        near_earth: {
          url: 'https://raw.githubusercontent.com/vega/vega-datasets/main/data/gapminder.json',
          table: 'gapminder',
          type: 'json',
        },
      };

      const config = datasetConfig[name];
      if (!config) throw new Error(`Unknown sample dataset: ${name}`);

      const schema = await ingestURL(config.url, config.table, config.type);
      actions.setSchema(schema);
      actions.setDataQuality(detectDataQualityIssues(schema, settings.dataQualityLevel));
      actions.setPhase('exploring');
      await generateDashboard(schema);
    } catch (e) {
      actions.setError(`Failed to load sample data: ${e instanceof Error ? e.message : String(e)}`);
      actions.setPhase('landing');
    }
  }, [actions, settings, generateDashboard]);

  // Handle chat messages for dashboard refinement
  const handleChatSend = useCallback(async (message: string) => {
    const provider = getLLMProvider();
    if (!provider || !state.dashboard || !state.schema) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };
    actions.addMessage(userMsg);
    actions.setGenerating(true);

    try {
      const result = await provider.refineDashboard(
        state.dashboard,
        message,
        state.schema,
        state.messages,
        settings.domainContext || undefined,
      );

      actions.applyPatches(result.patches);

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: result.explanation,
        timestamp: Date.now(),
        followUps: result.followUps,
        educationalNote: result.educationalNote,
        patches: result.patches,
      };
      actions.addMessage(assistantMsg);
    } catch (e) {
      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Sorry, I ran into an error: ${e instanceof Error ? e.message : String(e)}`,
        timestamp: Date.now(),
      };
      actions.addMessage(errorMsg);
    } finally {
      actions.setGenerating(false);
    }
  }, [state.dashboard, state.schema, state.messages, actions, settings]);

  // Landing phase
  if (state.phase === 'landing') {
    return (
      <div className="h-screen flex flex-col">
        <Header hasData={false} onSettings={() => actions.toggleSettings()} onReset={() => actions.reset()} />
        <Landing onFileSelect={handleFileSelect} onSampleData={handleSampleData} />
        {state.settingsOpen && (
          <Settings settings={settings} onUpdate={updateSettings} onClose={() => actions.toggleSettings()} saveError={saveError} />
        )}
        {state.error && (
          <ErrorToast message={state.error} onDismiss={() => actions.setError(null)} />
        )}
      </div>
    );
  }

  // Loading phase
  if (state.phase === 'loading') {
    return (
      <div className="h-screen flex flex-col">
        <Header hasData={false} onSettings={() => actions.toggleSettings()} onReset={() => actions.reset()} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-500">Loading data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Exploring phase
  return (
    <div className="h-screen flex flex-col">
      <Header
        hasData={true}
        onSettings={() => actions.toggleSettings()}
        onReset={() => actions.reset()}
        fileName={state.schema?.fileName}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Schema Sidebar */}
        {state.schema && (
          <SchemaPanel schema={state.schema} dataQualityIssues={state.dataQualityIssues} />
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {state.isGenerating && !state.dashboard ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-slate-500">Generating dashboard...</p>
                <p className="text-slate-400 text-sm">The AI is analyzing your data and building charts</p>
              </div>
            </div>
          ) : state.dashboard ? (
            <Dashboard spec={state.dashboard} tableName={state.schema!.tableName} />
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3 text-slate-400">
                  <p>No dashboard yet.</p>
                  <p className="text-sm">Set your API key in Settings to auto-generate one,</p>
                  <p className="text-sm">or explore your data with SQL (<kbd className="px-1 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs text-slate-500">⌘S</kbd>).</p>
                </div>
              </div>
              {state.schema && <DataPreview tableName={state.schema.tableName} />}
            </div>
          )}

          {/* Data Preview below dashboard */}
          {state.dashboard && state.schema && (
            <DataPreview tableName={state.schema.tableName} />
          )}

          {/* SQL Panel */}
          {state.sqlPanelOpen && state.schema && (
            <SqlPanel tableName={state.schema.tableName} onClose={() => actions.toggleSqlPanel()} />
          )}
        </div>

        {/* Chat Panel */}
        {state.dashboard && (
          <ChatPanel messages={state.messages} onSend={handleChatSend} isGenerating={state.isGenerating} />
        )}
      </div>

      {state.settingsOpen && (
        <Settings settings={settings} onUpdate={updateSettings} onClose={() => actions.toggleSettings()} saveError={saveError} />
      )}
      {state.error && (
        <ErrorToast message={state.error} onDismiss={() => actions.setError(null)} />
      )}
    </div>
  );
}

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 left-4 right-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm max-w-lg mx-auto z-50 shadow-lg">
      {message}
      <button onClick={onDismiss} className="ml-3 text-red-500 hover:text-red-700 font-medium">
        Dismiss
      </button>
    </div>
  );
}
