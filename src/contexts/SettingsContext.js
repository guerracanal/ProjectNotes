'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SettingsContext = createContext(null);
const STORAGE_KEY = 'project_notes_settings';

export const DEFAULT_SETTINGS = {
  // Content
  showMeetings: true,
  showTranscriptsInNotes: false,
  projectsView: 'grid', // 'grid' | 'table'
  density: 'comfortable', // 'comfortable' | 'compact'

  // Assistant
  assistantScope: 'all', // 'all' | 'project'
  assistantTopK: 8,

  // Google Drive
  gdriveClientId: '',
  gdriveFolderName: 'ProjectNotes',
  gdriveAutoSync: false,
  gdriveAutoSyncInterval: 5,
  gdriveLastSync: null,
  gdriveSyncStats: null,
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        // Merge over the defaults so a setting added in a later release is
        // present even for users with an older stored blob.
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (e) {
      console.error('Error loading settings:', e);
    } finally {
      setLoaded(true);
    }
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error saving settings:', e);
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings, loaded }),
    [settings, updateSettings, resetSettings, loaded]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
