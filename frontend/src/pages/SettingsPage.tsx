import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';
import { DatabaseService } from '../services/DatabaseService';
import TranscriptionSettings, { TranscriptionSettings as TranscriptionSettingsType } from '../components/transcription/TranscriptionSettings';
import LanguageSelector from '../components/language/LanguageSelector';

// Icons
import {
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  MicrophoneIcon,
  LanguageIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

interface Settings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  transcriptionModel: string;
  summarizationModel: string;
  autoSave: boolean;
  autoTranscribe: boolean;
  autoSummarize: boolean;
  userId?: string;
  transcriptionSettings?: TranscriptionSettingsType;
}

const SettingsPage = (): React.ReactElement => {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<Settings>({
    theme: theme === 'light' ? 'light' : 'dark',
    language: 'en',
    transcriptionModel: 'whisper-small',
    summarizationModel: 'bart-large-cnn',
    autoSave: true,
    autoTranscribe: true,
    autoSummarize: true,
    userId: 'default-user', // Default user ID
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [transcriptionSettings, setTranscriptionSettings] = useState<TranscriptionSettingsType | null>(null);
  
  // Load settings from database
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load user settings from database
      const userSettings = await DatabaseService.getUserSettings(settings.userId || 'default-user');
      
      if (userSettings) {
        // Update settings with database values
        setSettings(prev => ({
          ...prev,
          ...userSettings,
        }));
      } else {
        // Fallback to localStorage if database fails
        const savedSettings = localStorage.getItem('clariimeet-settings');
        if (savedSettings) {
          setSettings(prev => ({
            ...prev,
            ...JSON.parse(savedSettings),
          }));
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      
      // Fallback to localStorage if database fails
      const savedSettings = localStorage.getItem('clariimeet-settings');
      if (savedSettings) {
        setSettings(prev => ({
          ...prev,
          ...JSON.parse(savedSettings),
        }));
      }
    } finally {
      setIsLoading(false);
    }
  }, [settings.userId]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);
  
  // Save settings to database
  const saveSettings = async () => {
    setSaveStatus('saving');
    setIsLoading(true);
    
    try {
      // Save to database
      if (settings.userId) {
        const success = await DatabaseService.saveUserSettings(settings.userId, settings);
        if (!success) {
          throw new Error('Failed to save settings to database');
        }
      }
      
      // Backup to localStorage
      localStorage.setItem('clariimeet-settings', JSON.stringify(settings));
      
      // Update theme
      if (settings.theme !== 'system') {
        setTheme(settings.theme);
      } else {
        // Use system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
      }
      
      setSaveStatus('success');
      
      // Reset status after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
      
      // Reset status after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle transcription settings change
  const handleTranscriptionSettingsChange = (newSettings: TranscriptionSettingsType) => {
    setTranscriptionSettings(newSettings);
    setSettings(prevSettings => ({
      ...prevSettings,
      transcriptionSettings: newSettings,
      language: newSettings.language, // Update main language setting to match
    }));
  };
  
  // Handle input change
  const handleChange = (field: keyof Settings, value: any) => {
    setSettings({
      ...settings,
      [field]: value,
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Settings
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Customize your Clarimeet experience
        </p>
      </motion.div>

      <div className="bg-white dark:bg-dark-700 rounded-lg shadow-md overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-6">Appearance</h2>
          
          {/* Language Selector */}
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-3">Language Preferences</h3>
            <div className="bg-white dark:bg-dark-600 p-4 rounded-md shadow-sm">
              <LanguageSelector
                selectedLanguage={settings.language}
                onLanguageChange={(language) => handleChange('language', language)}
                userId={settings.userId}
                showNativeNames={true}
                size="medium"
              />
            </div>
          </div>

          {/* Transcription Settings */}
          <div className="mb-8">
            <h3 className="text-lg font-medium mb-3">Transcription Settings</h3>
            <div className="bg-white dark:bg-dark-600 p-4 rounded-md shadow-sm">
              <TranscriptionSettings
                onSettingsChange={handleTranscriptionSettingsChange}
                initialSettings={settings.transcriptionSettings}
                userId={settings.userId}
                className="transcription-settings"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="label">Theme</label>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <button
                  type="button"
                  className={`flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-dark-500 p-4 ${
                    settings.theme === 'light'
                      ? 'bg-primary-50 border-primary-500 dark:bg-primary-900/20 dark:border-primary-500'
                      : 'bg-white dark:bg-dark-600'
                  }`}
                  onClick={() => handleChange('theme', 'light')}
                >
                  <SunIcon className="h-8 w-8 text-yellow-500 mb-2" />
                  <span className="text-sm font-medium">Light</span>
                </button>
                
                <button
                  type="button"
                  className={`flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-dark-500 p-4 ${
                    settings.theme === 'dark'
                      ? 'bg-primary-50 border-primary-500 dark:bg-primary-900/20 dark:border-primary-500'
                      : 'bg-white dark:bg-dark-600'
                  }`}
                  onClick={() => handleChange('theme', 'dark')}
                >
                  <MoonIcon className="h-8 w-8 text-indigo-500 mb-2" />
                  <span className="text-sm font-medium">Dark</span>
                </button>
                
                <button
                  type="button"
                  className={`flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-dark-500 p-4 ${
                    settings.theme === 'system'
                      ? 'bg-primary-50 border-primary-500 dark:bg-primary-900/20 dark:border-primary-500'
                      : 'bg-white dark:bg-dark-600'
                  }`}
                  onClick={() => handleChange('theme', 'system')}
                >
                  <ComputerDesktopIcon className="h-8 w-8 text-gray-500 mb-2" />
                  <span className="text-sm font-medium">System</span>
                </button>
              </div>
            </div>
            
            <div>
              <label htmlFor="language" className="label">Language</label>
              <select
                id="language"
                className="input mt-2"
                value={settings.language}
                onChange={(e) => handleChange('language', e.target.value)}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="ja">日本語</option>
                <option value="zh">中文</option>
              </select>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                This affects the language used for transcription and UI elements
              </p>
            </div>
          </div>
          
          <h2 className="text-xl font-semibold mb-6">AI Models</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label htmlFor="transcriptionModel" className="label">Transcription Model</label>
              <select
                id="transcriptionModel"
                className="input mt-2"
                value={settings.transcriptionModel}
                onChange={(e) => handleChange('transcriptionModel', e.target.value)}
              >
                <option value="whisper-tiny">Whisper Tiny (Fast, Less Accurate)</option>
                <option value="whisper-base">Whisper Base</option>
                <option value="whisper-small">Whisper Small (Recommended)</option>
                <option value="whisper-medium">Whisper Medium</option>
                <option value="whisper-large">Whisper Large (Slow, Most Accurate)</option>
                <option value="vosk-model-small-en-us-0.15">Vosk Small (Offline)</option>
              </select>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Larger models are more accurate but require more resources
              </p>
            </div>
            
            <div>
              <label htmlFor="summarizationModel" className="label">Summarization Model</label>
              <select
                id="summarizationModel"
                className="input mt-2"
                value={settings.summarizationModel}
                onChange={(e) => handleChange('summarizationModel', e.target.value)}
              >
                <option value="bart-large-cnn">BART Large CNN (Recommended)</option>
                <option value="t5-small">T5 Small (Fast)</option>
                <option value="t5-base">T5 Base</option>
                <option value="pegasus-xsum">Pegasus XSum</option>
                <option value="extractive">Extractive (No AI, Fastest)</option>
              </select>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Affects the quality and speed of meeting summaries
              </p>
            </div>
          </div>
          
          <h2 className="text-xl font-semibold mb-6">Behavior</h2>
          
          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Auto-Save Recordings</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Automatically save recordings when stopped
                </p>
              </div>
              <div className="relative inline-block w-12 align-middle select-none">
                <input
                  type="checkbox"
                  name="autoSave"
                  id="autoSave"
                  className="sr-only"
                  checked={settings.autoSave}
                  onChange={(e) => handleChange('autoSave', e.target.checked)}
                />
                <label
                  htmlFor="autoSave"
                  className={`block overflow-hidden h-6 rounded-full cursor-pointer transition-colors ${
                    settings.autoSave ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-500'
                  }`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow transform transition-transform ${
                      settings.autoSave ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </label>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Auto-Transcribe</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Automatically start transcription when recording or uploading
                </p>
              </div>
              <div className="relative inline-block w-12 align-middle select-none">
                <input
                  type="checkbox"
                  name="autoTranscribe"
                  id="autoTranscribe"
                  className="sr-only"
                  checked={settings.autoTranscribe}
                  onChange={(e) => handleChange('autoTranscribe', e.target.checked)}
                />
                <label
                  htmlFor="autoTranscribe"
                  className={`block overflow-hidden h-6 rounded-full cursor-pointer transition-colors ${
                    settings.autoTranscribe ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-500'
                  }`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow transform transition-transform ${
                      settings.autoTranscribe ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </label>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Auto-Summarize</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Automatically generate summaries when transcription completes
                </p>
              </div>
              <div className="relative inline-block w-12 align-middle select-none">
                <input
                  type="checkbox"
                  name="autoSummarize"
                  id="autoSummarize"
                  className="sr-only"
                  checked={settings.autoSummarize}
                  onChange={(e) => handleChange('autoSummarize', e.target.checked)}
                />
                <label
                  htmlFor="autoSummarize"
                  className={`block overflow-hidden h-6 rounded-full cursor-pointer transition-colors ${
                    settings.autoSummarize ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-500'
                  }`}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow transform transition-transform ${
                      settings.autoSummarize ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </label>
              </div>
            </div>
          </div>
          
          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={saveSettings}
              disabled={isLoading || saveStatus === 'saving'}
              className="btn btn-primary px-6"
            >
              {saveStatus === 'saving' ? (
                <>
                  <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : saveStatus === 'success' ? (
                <>
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  Saved!
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
          
          {saveStatus === 'error' && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded">
              Error saving settings. Please try again.
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-8 p-6 bg-gray-50 dark:bg-dark-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">About Clarimeet</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Clarimeet is a next-generation AI meeting companion designed to help you record, transcribe, and summarize your meetings with ease.
        </p>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          <p>Version: 1.0.0</p>
          <p>© 2025 Clarimeet</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
