'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
    // Default settings
    const [settings, setSettings] = useState({
        showMeetings: true,
        gdriveClientId: '',
        gdriveFolderName: 'ProjectNotes',
        gdriveAutoSync: false,
        gdriveAutoSyncInterval: 5,
        gdriveLastSync: null,
        gdriveSyncStats: null
    });
    const [loaded, setLoaded] = useState(false);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const savedSettings = localStorage.getItem('project_notes_settings');
            if (savedSettings) {
                setSettings(JSON.parse(savedSettings));
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        } finally {
            setLoaded(true);
        }
    }, []);

    // Save to localStorage on change
    const updateSettings = (newSettings) => {
        const updated = { ...settings, ...newSettings };
        setSettings(updated);
        try {
            localStorage.setItem('project_notes_settings', JSON.stringify(updated));
        } catch (e) {
            console.error('Error saving settings:', e);
        }
    };

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, loaded }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within SettingsProvider');
    }
    return context;
}
