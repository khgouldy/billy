import { useState, useCallback } from 'react';
import type { AppSettings } from '../types';

const STORAGE_KEY = 'benchcoach_settings';

const defaults: AppSettings = {
  llmProvider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  dataQualityLevel: 'subtle',
  domainContext: '',
};

function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaults, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return defaults;
}

function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
