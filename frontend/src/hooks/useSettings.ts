import { useState, useEffect, useCallback } from 'react';

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  transcriptionModel: string;
  transcriptionLanguage: string;
  summarizationModel: string;
  autoSave: boolean;
  autoTranscribe: boolean;
  autoSummarize: boolean;
  enableRealTimeAudio: boolean;
  apiBaseUrl?: string;
  apiBaseWebSocketUrl?: string;
}

const defaultSettings: Settings = {
  theme: 'system',
  language: 'en',
  transcriptionModel: 'whisper-small',
  transcriptionLanguage: 'en',
  summarizationModel: 'bart-large-cnn',
  autoSave: true,
  autoTranscribe: true,
  autoSummarize: true,
  enableRealTimeAudio: true,
  apiBaseUrl: 'http://localhost:8000',
  apiBaseWebSocketUrl: 'ws://localhost:8000',
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    const loadSettings = () => {
      try {
        const savedSettings = localStorage.getItem('clariimeet-settings');
        if (savedSettings) {
          setSettings(JSON.parse(savedSettings));
        }
        setIsLoaded(true);
      } catch (error) {
        console.error('Error loading settings:', error);
        setIsLoaded(true);
      }
    };

    loadSettings();
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback((newSettings: Partial<Settings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      localStorage.setItem('clariimeet-settings', JSON.stringify(updatedSettings));
      setSettings(updatedSettings);
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }, [settings]);

  // Update a single setting
  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    return saveSettings({ [key]: value } as Partial<Settings>);
  }, [saveSettings]);

  // Reset settings to default
  const resetSettings = useCallback(() => {
    localStorage.removeItem('clariimeet-settings');
    setSettings(defaultSettings);
    return true;
  }, []);

  return {
    settings,
    isLoaded,
    saveSettings,
    updateSetting,
    resetSettings,
  };
};

export default useSettings;
