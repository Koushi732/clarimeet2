import React, { useState, useEffect } from 'react';
import LanguageSelector from '../language/LanguageSelector';

interface TranscriptionSettingsProps {
  onSettingsChange: (settings: TranscriptionSettings) => void;
  initialSettings?: Partial<TranscriptionSettings>;
  className?: string;
}

export interface TranscriptionSettings {
  language: string;
  speakerDiarization: boolean;
  maxSpeakers: number;
  model: 'default' | 'enhanced' | 'fast';
  autoGenerateSummary: boolean;
  summaryFormat: 'bullet' | 'paragraph' | 'structured';
}

const DEFAULT_SETTINGS: TranscriptionSettings = {
  language: 'en',
  speakerDiarization: true,
  maxSpeakers: 4,
  model: 'default',
  autoGenerateSummary: true,
  summaryFormat: 'structured',
};

/**
 * Component for configuring transcription settings including language,
 * speaker diarization options, and summarization preferences
 */
const TranscriptionSettings: React.FC<TranscriptionSettingsProps> = ({
  onSettingsChange,
  initialSettings = {},
  className = '',
}) => {
  // Merge default settings with any initial settings provided
  const [settings, setSettings] = useState<TranscriptionSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });

  // Notify parent when settings change
  useEffect(() => {
    onSettingsChange(settings);
  }, [settings, onSettingsChange]);

  // Update a single setting and maintain the rest
  const updateSetting = <K extends keyof TranscriptionSettings>(
    key: K,
    value: TranscriptionSettings[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className={`space-y-5 ${className}`}>
      <h2 className="text-lg font-semibold mb-3">Transcription Settings</h2>
      
      {/* Language Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Language
        </label>
        <LanguageSelector
          selectedLanguage={settings.language}
          onLanguageChange={(language) => updateSetting('language', language)}
        />
      </div>
      
      {/* Speaker Diarization */}
      <div className="space-y-3">
        <div className="flex items-center">
          <input
            id="speaker-diarization"
            type="checkbox"
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            checked={settings.speakerDiarization}
            onChange={(e) => updateSetting('speakerDiarization', e.target.checked)}
          />
          <label
            htmlFor="speaker-diarization"
            className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Enable Speaker Diarization
          </label>
        </div>
        
        {settings.speakerDiarization && (
          <div className="ml-6 space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Maximum Number of Speakers
            </label>
            <select
              className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              value={settings.maxSpeakers}
              onChange={(e) => updateSetting('maxSpeakers', parseInt(e.target.value))}
            >
              {[2, 3, 4, 5, 6, 8, 10].map((num) => (
                <option key={num} value={num}>
                  {num} speakers
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      {/* Transcription Model */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Transcription Model
        </label>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            className={`py-2 px-3 text-sm border rounded-md ${
              settings.model === 'default'
                ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                : 'border-gray-300 dark:border-gray-600 dark:bg-gray-700'
            }`}
            onClick={() => updateSetting('model', 'default')}
          >
            Default
          </button>
          <button
            type="button"
            className={`py-2 px-3 text-sm border rounded-md ${
              settings.model === 'enhanced'
                ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                : 'border-gray-300 dark:border-gray-600 dark:bg-gray-700'
            }`}
            onClick={() => updateSetting('model', 'enhanced')}
          >
            Enhanced
          </button>
          <button
            type="button"
            className={`py-2 px-3 text-sm border rounded-md ${
              settings.model === 'fast'
                ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                : 'border-gray-300 dark:border-gray-600 dark:bg-gray-700'
            }`}
            onClick={() => updateSetting('model', 'fast')}
          >
            Fast
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {settings.model === 'default' && 'Balanced accuracy and speed (recommended)'}
          {settings.model === 'enhanced' && 'Higher accuracy but slower processing'}
          {settings.model === 'fast' && 'Faster processing with reduced accuracy'}
        </p>
      </div>
      
      {/* Summarization Settings */}
      <div className="space-y-3">
        <div className="flex items-center">
          <input
            id="auto-summary"
            type="checkbox"
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            checked={settings.autoGenerateSummary}
            onChange={(e) => updateSetting('autoGenerateSummary', e.target.checked)}
          />
          <label
            htmlFor="auto-summary"
            className="ml-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Auto-generate Summary
          </label>
        </div>
        
        {settings.autoGenerateSummary && (
          <div className="ml-6 space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Summary Format
            </label>
            <select
              className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              value={settings.summaryFormat}
              onChange={(e) => updateSetting('summaryFormat', e.target.value as TranscriptionSettings['summaryFormat'])}
            >
              <option value="bullet">Bullet Points</option>
              <option value="paragraph">Paragraph</option>
              <option value="structured">Structured (Topics, Action Items, Decisions)</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscriptionSettings;
