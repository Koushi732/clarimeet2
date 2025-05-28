import React, { useState, useEffect, useMemo } from 'react';
import { GlobeAltIcon, CheckIcon, ClockIcon } from '@heroicons/react/24/solid';
import { useSettingsContext } from '../../contexts/SettingsContext';

interface LanguageOption {
  code: string;
  name: string;
  nativeName?: string;
  supportLevel: 'full' | 'beta' | 'limited';
}

interface LanguageSelectorProps {
  onLanguageChange?: (languageCode: string) => void;
  disabled?: boolean;
  showRecent?: boolean;
  maxRecent?: number;
}

// Language data with support levels
const LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English', nativeName: 'English', supportLevel: 'full' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', supportLevel: 'full' },
  { code: 'fr', name: 'French', nativeName: 'Français', supportLevel: 'full' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', supportLevel: 'full' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', supportLevel: 'full' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', supportLevel: 'full' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', supportLevel: 'full' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', supportLevel: 'full' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', supportLevel: 'full' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', supportLevel: 'full' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', supportLevel: 'full' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', supportLevel: 'full' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', supportLevel: 'full' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', supportLevel: 'beta' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', supportLevel: 'beta' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', supportLevel: 'beta' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', supportLevel: 'beta' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', supportLevel: 'beta' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', supportLevel: 'beta' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', supportLevel: 'beta' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', supportLevel: 'beta' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', supportLevel: 'beta' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', supportLevel: 'beta' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', supportLevel: 'beta' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', supportLevel: 'beta' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', supportLevel: 'limited' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', supportLevel: 'limited' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', supportLevel: 'limited' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', supportLevel: 'limited' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', supportLevel: 'limited' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', supportLevel: 'limited' }
];

const RECENT_LANGUAGES_KEY = 'clarimeet-recent-languages';

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  onLanguageChange,
  disabled = false,
  showRecent = true,
  maxRecent = 3
}) => {
  const { settings, updateSetting } = useSettingsContext();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentLanguages, setRecentLanguages] = useState<string[]>([]);
  
  // Load recent languages from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_LANGUAGES_KEY);
      if (stored) {
        setRecentLanguages(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading recent languages:', error);
    }
  }, []);
  
  // Save current language to recent languages
  useEffect(() => {
    if (settings.transcriptionLanguage && showRecent) {
      setRecentLanguages(prev => {
        // Remove current language if it exists in the list
        const filtered = prev.filter(code => code !== settings.transcriptionLanguage);
        
        // Add current language to the beginning
        const updated = [settings.transcriptionLanguage, ...filtered].slice(0, maxRecent);
        
        // Save to localStorage
        localStorage.setItem(RECENT_LANGUAGES_KEY, JSON.stringify(updated));
        
        return updated;
      });
    }
  }, [settings.transcriptionLanguage, showRecent, maxRecent]);
  
  // Filter languages based on search query
  const filteredLanguages = useMemo(() => {
    if (!searchQuery.trim()) {
      return LANGUAGES;
    }
    
    const query = searchQuery.toLowerCase();
    return LANGUAGES.filter(
      lang => 
        lang.name.toLowerCase().includes(query) || 
        lang.code.toLowerCase().includes(query) ||
        (lang.nativeName && lang.nativeName.toLowerCase().includes(query))
    );
  }, [searchQuery]);
  
  // Get current language details
  const currentLanguage = useMemo(() => {
    return LANGUAGES.find(lang => lang.code === settings.transcriptionLanguage) || LANGUAGES[0];
  }, [settings.transcriptionLanguage]);
  
  // Handle language change
  const handleLanguageChange = (languageCode: string) => {
    updateSetting('transcriptionLanguage', languageCode);
    
    if (onLanguageChange) {
      onLanguageChange(languageCode);
    }
    
    setIsOpen(false);
  };
  
  // Support level badge component
  const SupportLevelBadge = ({ level }: { level: 'full' | 'beta' | 'limited' }) => {
    const colors = {
      full: 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100',
      beta: 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100',
      limited: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
    };
    
    const labels = {
      full: 'Full',
      beta: 'Beta',
      limited: 'Limited'
    };
    
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded ${colors[level]}`}>
        {labels[level]}
      </span>
    );
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center space-x-2 px-3 py-2 rounded-md border ${
          disabled 
            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed dark:bg-dark-700 dark:border-dark-600'
            : 'bg-white border-gray-300 hover:bg-gray-50 dark:bg-dark-800 dark:border-dark-600 dark:hover:bg-dark-700'
        }`}
        disabled={disabled}
      >
        <GlobeAltIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        <span>{currentLanguage.name}</span>
        {currentLanguage.nativeName && currentLanguage.nativeName !== currentLanguage.name && (
          <span className="text-gray-500 dark:text-gray-400 text-sm">({currentLanguage.nativeName})</span>
        )}
      </button>
      
      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white dark:bg-dark-800 rounded-md shadow-lg border border-gray-200 dark:border-dark-600">
          <div className="p-2">
            <input
              type="text"
              placeholder="Search languages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-600 rounded-md bg-white dark:bg-dark-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
          </div>
          
          {/* Recent languages */}
          {showRecent && recentLanguages.length > 0 && !searchQuery && (
            <div className="px-2 pb-2">
              <div className="flex items-center px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                <ClockIcon className="h-3 w-3 mr-1" />
                Recent
              </div>
              {recentLanguages.map(code => {
                const lang = LANGUAGES.find(l => l.code === code);
                if (!lang) return null;
                
                return (
                  <button
                    key={`recent-${lang.code}`}
                    onClick={() => handleLanguageChange(lang.code)}
                    className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-700 rounded-md"
                  >
                    <div className="flex items-center">
                      <span>{lang.name}</span>
                      {lang.nativeName && lang.nativeName !== lang.name && (
                        <span className="ml-1 text-gray-500 dark:text-gray-400 text-xs">
                          ({lang.nativeName})
                        </span>
                      )}
                    </div>
                    <SupportLevelBadge level={lang.supportLevel} />
                  </button>
                );
              })}
              <div className="mx-2 my-1 border-t border-gray-200 dark:border-dark-600"></div>
            </div>
          )}
          
          {/* All languages */}
          <div className="max-h-60 overflow-y-auto pb-2 px-2">
            {filteredLanguages.map(lang => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-700 rounded-md"
              >
                <div className="flex items-center">
                  {lang.code === settings.transcriptionLanguage && (
                    <CheckIcon className="h-4 w-4 text-primary-500 mr-1" />
                  )}
                  <span>{lang.name}</span>
                  {lang.nativeName && lang.nativeName !== lang.name && (
                    <span className="ml-1 text-gray-500 dark:text-gray-400 text-xs">
                      ({lang.nativeName})
                    </span>
                  )}
                </div>
                <SupportLevelBadge level={lang.supportLevel} />
              </button>
            ))}
            
            {filteredLanguages.length === 0 && (
              <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                No languages found matching "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
