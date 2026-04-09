import { useReducer, useCallback } from 'react';
import type { AppState, AppAction, PatchOp, DashboardSpec } from '../types';

const initialState: AppState = {
  phase: 'landing',
  schema: null,
  dashboard: null,
  messages: [],
  dataQualityIssues: [],
  sqlPanelOpen: false,
  settingsOpen: false,
  isGenerating: false,
  error: null,
};

function applyPatches(spec: DashboardSpec, patches: PatchOp[]): DashboardSpec {
  let result = { ...spec, charts: [...spec.charts], summaryStats: [...(spec.summaryStats || [])] };

  for (const patch of patches) {
    switch (patch.op) {
      case 'add':
        result.charts.push(patch.chart);
        break;
      case 'remove':
        result.charts = result.charts.filter(c => c.id !== patch.chartId);
        break;
      case 'modify': {
        const idx = result.charts.findIndex(c => c.id === patch.chartId);
        if (idx >= 0) {
          result.charts[idx] = { ...result.charts[idx], ...patch.changes };
        }
        break;
      }
      case 'addStat':
        result.summaryStats = [...(result.summaryStats || []), patch.stat];
        break;
      case 'removeStat':
        result.summaryStats = (result.summaryStats || []).filter(s => s.label !== patch.label);
        break;
      case 'replaceAll':
        result = { ...patch.spec };
        break;
    }
  }

  return result;
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase, error: null };
    case 'SET_SCHEMA':
      return { ...state, schema: action.schema };
    case 'SET_DASHBOARD':
      return { ...state, dashboard: action.dashboard };
    case 'APPLY_PATCHES':
      if (!state.dashboard) return state;
      return { ...state, dashboard: applyPatches(state.dashboard, action.patches) };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'SET_DATA_QUALITY':
      return { ...state, dataQualityIssues: action.issues };
    case 'TOGGLE_SQL_PANEL':
      return { ...state, sqlPanelOpen: !state.sqlPanelOpen };
    case 'TOGGLE_SETTINGS':
      return { ...state, settingsOpen: !state.settingsOpen };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.isGenerating };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const actions = {
    setPhase: useCallback((phase: AppState['phase']) =>
      dispatch({ type: 'SET_PHASE', phase }), []),
    setSchema: useCallback((schema: AppState['schema']) =>
      dispatch({ type: 'SET_SCHEMA', schema: schema! }), []),
    setDashboard: useCallback((dashboard: DashboardSpec) =>
      dispatch({ type: 'SET_DASHBOARD', dashboard }), []),
    applyPatches: useCallback((patches: PatchOp[]) =>
      dispatch({ type: 'APPLY_PATCHES', patches }), []),
    addMessage: useCallback((message: AppState['messages'][0]) =>
      dispatch({ type: 'ADD_MESSAGE', message }), []),
    setDataQuality: useCallback((issues: AppState['dataQualityIssues']) =>
      dispatch({ type: 'SET_DATA_QUALITY', issues }), []),
    toggleSqlPanel: useCallback(() =>
      dispatch({ type: 'TOGGLE_SQL_PANEL' }), []),
    toggleSettings: useCallback(() =>
      dispatch({ type: 'TOGGLE_SETTINGS' }), []),
    setGenerating: useCallback((isGenerating: boolean) =>
      dispatch({ type: 'SET_GENERATING', isGenerating }), []),
    setError: useCallback((error: string | null) =>
      dispatch({ type: 'SET_ERROR', error }), []),
    reset: useCallback(() =>
      dispatch({ type: 'RESET' }), []),
  };

  return { state, actions };
}
