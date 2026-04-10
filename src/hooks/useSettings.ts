import { useState, useCallback } from 'react';
import type { AppSettings } from '../types';

const STORAGE_KEY = 'billy_settings';

const defaults: AppSettings = {
  llmProvider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  ollamaUrl: 'http://localhost:11434',
  dataQualityLevel: 'subtle',
  domainContext: '',
};

function loadSettings(): { settings: AppSettings; error: string | null } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { settings: { ...defaults, ...JSON.parse(stored) }, error: null };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[Billy] Failed to load settings:', msg);
    return { settings: defaults, error: `Could not load saved settings: ${msg}` };
  }
  return { settings: defaults, error: null };
}

function saveSettings(settings: AppSettings): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[Billy] Failed to save settings:', msg);
    return `Settings could not be saved: ${msg}`;
  }
}

export function useSettings() {
  const [initial] = useState(loadSettings);
  const [settings, setSettingsState] = useState<AppSettings>(initial.settings);
  const [saveError, setSaveError] = useState<string | null>(initial.error);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...updates };
      const error = saveSettings(next);
      setSaveError(error);
      return next;
    });
  }, []);

  return { settings, updateSettings, saveError };
}
