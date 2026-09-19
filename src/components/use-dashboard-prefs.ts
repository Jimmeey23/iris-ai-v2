"use client";

import {useCallback, useEffect, useRef, useState} from 'react';
import {api} from './ui';
import {
  DEFAULT_DASHBOARD, EMPTY_FILTERS,
  type DashboardPrefs, type FilterState, type SavedView,
} from '@/lib/dashboard-contract';

/**
 * The board's layout, filters and saved views — held in the database, not the browser.
 *
 * Two rules make this behave. Writes are debounced, because dragging a page-size selector
 * or typing in the search box would otherwise be one request per keystroke. And nothing is
 * written until the first read has come back, so a slow load cannot save the defaults over
 * the preferences it was in the middle of fetching.
 */
const SAVE_DEBOUNCE_MS = 700;

export interface DashboardPrefsApi {
  prefs: DashboardPrefs;
  views: SavedView[];
  loaded: boolean;
  /** Merge a change into the stored preferences and schedule a save. */
  update: (patch: Partial<DashboardPrefs>) => void;
  /** Merge a change into the filter state only. */
  setFilters: (patch: Partial<FilterState>) => void;
  resetFilters: () => void;
  saveView: (view: SavedView) => Promise<void>;
  deleteView: (name: string) => Promise<void>;
}

export function useDashboardPrefs(): DashboardPrefsApi {
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_DASHBOARD);
  const [views, setViews] = useState<SavedView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<DashboardPrefs>>({});

  useEffect(() => {
    let cancelled = false;
    void api<{dashboard?: DashboardPrefs; views?: SavedView[]}>('/api/preferences')
      .then((d) => {
        if (cancelled) return;
        if (d.dashboard) setPrefs({...DEFAULT_DASHBOARD, ...d.dashboard, filters: {...EMPTY_FILTERS, ...(d.dashboard.filters || {})}});
        if (Array.isArray(d.views)) setViews(d.views);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const flush = useCallback(() => {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    void api('/api/preferences', {method: 'PATCH', body: JSON.stringify({dashboard: patch})}).catch(() => {});
  }, []);

  const schedule = useCallback((patch: Partial<DashboardPrefs>) => {
    pending.current = {...pending.current, ...patch};
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // A change made a moment before navigating away still has to reach the server.
  useEffect(() => {
    const onHide = () => { if (document.hidden) flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  const update = useCallback((patch: Partial<DashboardPrefs>) => {
    setPrefs((p) => ({...p, ...patch}));
    if (loaded) schedule(patch);
  }, [loaded, schedule]);

  const setFilters = useCallback((patch: Partial<FilterState>) => {
    setPrefs((p) => {
      const filters = {...p.filters, ...patch};
      if (loaded) schedule({filters});
      return {...p, filters};
    });
  }, [loaded, schedule]);

  const resetFilters = useCallback(() => {
    setPrefs((p) => ({...p, filters: EMPTY_FILTERS}));
    if (loaded) schedule({filters: EMPTY_FILTERS});
  }, [loaded, schedule]);

  const persistViews = useCallback(async (next: SavedView[]) => {
    setViews(next);
    await api('/api/preferences', {method: 'PATCH', body: JSON.stringify({views: next})});
  }, []);

  const saveView = useCallback(async (view: SavedView) => {
    // Saving under an existing name replaces it rather than making a second entry.
    await persistViews([...views.filter((v) => v.name !== view.name), view]);
  }, [views, persistViews]);

  const deleteView = useCallback(async (name: string) => {
    await persistViews(views.filter((v) => v.name !== name));
  }, [views, persistViews]);

  return {prefs, views, loaded, update, setFilters, resetFilters, saveView, deleteView};
}
