import React, { useState, useEffect, useCallback } from 'react';
import { DatabaseService, Language as DbLanguage } from '../../services/DatabaseService';

export interface Language {
  code: string;
  name: string;
  nativeName?: string;
  supportLevel: 'full' | 'beta' | 'limited';
  popular?: boolean;
}

interface LanguageSelectorProps {
  selectedLanguage: string;
  onLanguageChange: (languageCode: string) => void;
  size?: 'small' | 'medium' | 'large';
  showNativeNames?: boolean;
  userId?: string; // User ID for user-specific recent languages
  sessionId?: string; // Session ID for session-specific recent languages
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onLanguageChange,
  size = 'medium',
  showNativeNames = true,
  userId = 'default-user', // Default user ID if none provided
  sessionId = undefined // Session ID for session-specific settings (optional)
}) => {
  // Language history and state
  const [recentLanguages, setRecentLanguages] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [languages, setLanguages] = useState<Language[]>(SUPPORTED_LANGUAGES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load languages from API
  const loadLanguages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const apiLanguages = await DatabaseService.getAllLanguages();
      
      if (apiLanguages && apiLanguages.length > 0) {
        // Convert API languages to component format
        const formattedLanguages: Language[] = apiLanguages.map(lang => ({
          code: lang.code,
          name: lang.name,
          supportLevel: lang.level,
          // Keep native names and popular flags from our static list
          nativeName: SUPPORTED_LANGUAGES.find(sl => sl.code === lang.code)?.nativeName,
          popular: SUPPORTED_LANGUAGES.find(sl => sl.code === lang.code)?.popular
        }));
        
        setLanguages(formattedLanguages);
      }
    } catch (err) {
      console.error('Error loading languages from API:', err);
      setError('Failed to load languages from database');
      // Fallback to static language list
      setLanguages(SUPPORTED_LANGUAGES);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load recent languages from database or localStorage
  const loadRecentLanguages = useCallback(async () => {
    try {
      let foundRecentLanguages = false;
      
      // First try session-specific recent languages if sessionId is provided
      if (sessionId) {
        try {
          const sessionSetting = await DatabaseService.getSessionSetting(sessionId, 'recentLanguages');
          if (sessionSetting && sessionSetting.value && Array.isArray(sessionSetting.value)) {
            setRecentLanguages(sessionSetting.value);
            console.log('Loaded recent languages from session settings');
            foundRecentLanguages = true;
            return;
          }
        } catch (err) {
          console.error('Error loading session recent languages:', err);
          // Continue to fallbacks if session settings fail
        }
      }
      
      // Try to get from user settings if no session settings or not found
      if (!foundRecentLanguages && userId) {
        try {
          const recentLangs = await DatabaseService.getRecentLanguages(userId);
          if (recentLangs && recentLangs.length > 0) {
            const langCodes = recentLangs.map(lang => lang.code);
            setRecentLanguages(langCodes);
            console.log('Loaded recent languages from user settings');
            foundRecentLanguages = true;
            
            // If we have a sessionId, migrate user settings to session settings
            if (sessionId) {
              await DatabaseService.saveSessionSetting(sessionId, 'recentLanguages', langCodes);
              console.log('Migrated recent languages to session settings');
            }
            
            return;
          }
        } catch (err) {
          console.error('Error loading user recent languages:', err);
          // Continue to localStorage fallback
        }
      }
      
      // Fallback to localStorage if no database settings found
      if (!foundRecentLanguages) {
        const stored = localStorage.getItem('clarimeet_recent_languages');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setRecentLanguages(parsed);
              console.log('Loaded recent languages from localStorage');
              
              // If we have sessionId, save to session settings for future use
              if (sessionId) {
                await DatabaseService.saveSessionSetting(sessionId, 'recentLanguages', parsed);
                console.log('Saved localStorage recent languages to session settings');
              }
            }
          } catch (e) {
            console.error('Failed to parse recent languages from localStorage:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading recent languages:', error);
    }
  }, [userId, sessionId]);

  // Load languages and recent languages on component mount
  useEffect(() => {
    loadLanguages();
    loadRecentLanguages();
  }, [loadLanguages, loadRecentLanguages]);

  // Update recent languages when selection changes
  const updateRecentLanguages = async (languageCode: string) => {
    // Update local state first for immediate UI feedback
    const updatedRecent = [
      languageCode,
      ...recentLanguages.filter(code => code !== languageCode)
    ].slice(0, 5); // Keep only 5 most recent languages
    
    setRecentLanguages(updatedRecent);
    
    // First priority: Save to session settings if sessionId is provided
    if (sessionId) {
      try {
        await DatabaseService.saveSessionSetting(sessionId, 'recentLanguages', updatedRecent);
        console.log(`Saved recent languages with ${languageCode} to session ${sessionId}`);
      } catch (error) {
        console.error('Error saving recent languages to session settings:', error);
      }
    }
    
    // Second priority: Also save to user settings for cross-session history
    if (userId) {
      try {
        await DatabaseService.addRecentLanguage(userId, languageCode);
        console.log(`Added language ${languageCode} to recent languages for user ${userId}`);
      } catch (error) {
        console.error('Error updating recent languages in user settings:', error);
      }
    }
    
    // Store in localStorage as fallback
    localStorage.setItem('clarimeet_recent_languages', JSON.stringify(updatedRecent));
  };

  // Handle language selection
  const handleSelectLanguage = async (languageCode: string) => {
    onLanguageChange(languageCode);
    await updateRecentLanguages(languageCode);
    setIsOpen(false);
  };

  // Filter languages by search query
  const filteredLanguages = searchQuery
    ? languages.filter(
        lang =>
          lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.nativeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : languages;

  // Group languages by support level and recent/popular status
  const recentLanguageItems = languages.filter(lang => 
    recentLanguages.includes(lang.code)
  );

  const popularLanguageItems = languages.filter(lang => 
    lang.popular && !recentLanguages.includes(lang.code)
  );

  const selectedLanguageDetails = languages.find(
    lang => lang.code === selectedLanguage
  ) || languages[0];

  // Size classes
  const sizeClasses = {
    small: 'text-xs px-2 py-1',
    medium: 'text-sm px-3 py-1.5',
    large: 'text-base px-4 py-2'
  };

  return (
    <div className="relative inline-block text-left">
      {/* Selected language button */}
      <button
        type="button"
        className={`inline-flex items-center justify-between rounded-md border border-gray-300 bg-white dark:bg-gray-800 shadow-sm ${
          sizeClasses[size]
        } font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-100 min-w-[140px]`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center">
          <span className="mr-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            {selectedLanguageDetails.supportLevel === 'full' ? (
              <span className="text-green-500">●</span>
            ) : selectedLanguageDetails.supportLevel === 'beta' ? (
              <span className="text-yellow-500">●</span>
            ) : (
              <span className="text-red-500">●</span>
            )}
          </span>
          <span>
            {selectedLanguageDetails.name}
            {showNativeNames && selectedLanguageDetails.nativeName && 
              selectedLanguageDetails.name !== selectedLanguageDetails.nativeName && (
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                  ({selectedLanguageDetails.nativeName})
                </span>
              )
            }
          </span>
        </span>
        <svg
          className="-mr-1 ml-2 h-5 w-5"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-60 origin-top-right rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1 px-2">
            {/* Search input */}
            <div className="p-2">
              <input
                type="text"
                className="w-full px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="Search languages..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            {/* Language groups */}
            <div className="max-h-60 overflow-y-auto">
              {/* Recent languages */}
              {!searchQuery && recentLanguageItems.length > 0 && (
                <div className="py-1">
                  <h3 className="px-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Recent
                  </h3>
                  <div className="mt-1">
                    {recentLanguageItems.map(lang => (
                      <button
                        key={lang.code}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          lang.code === selectedLanguage
                            ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                            : ''
                        }`}
                        onClick={() => handleSelectLanguage(lang.code)}
                      >
                        <span className="mr-1 text-xs">
                          {lang.supportLevel === 'full' ? (
                            <span className="text-green-500">●</span>
                          ) : lang.supportLevel === 'beta' ? (
                            <span className="text-yellow-500">●</span>
                          ) : (
                            <span className="text-red-500">●</span>
                          )}
                        </span>
                        {lang.name}
                        {showNativeNames && lang.nativeName && lang.name !== lang.nativeName && (
                          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                            ({lang.nativeName})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Popular languages */}
              {!searchQuery && popularLanguageItems.length > 0 && (
                <div className="py-1">
                  <h3 className="px-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Popular
                  </h3>
                  <div className="mt-1">
                    {popularLanguageItems.map(lang => (
                      <button
                        key={lang.code}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          lang.code === selectedLanguage
                            ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                            : ''
                        }`}
                        onClick={() => handleSelectLanguage(lang.code)}
                      >
                        <span className="mr-1 text-xs">
                          {lang.supportLevel === 'full' ? (
                            <span className="text-green-500">●</span>
                          ) : lang.supportLevel === 'beta' ? (
                            <span className="text-yellow-500">●</span>
                          ) : (
                            <span className="text-red-500">●</span>
                          )}
                        </span>
                        {lang.name}
                        {showNativeNames && lang.nativeName && lang.name !== lang.nativeName && (
                          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                            ({lang.nativeName})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* All or filtered languages */}
              <div className="py-1">
                {searchQuery && (
                  <h3 className="px-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Search Results
                  </h3>
                )}
                {!searchQuery && (
                  <h3 className="px-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                    All Languages
                  </h3>
                )}
                <div className="mt-1">
                  {filteredLanguages.map(lang => (
                    <button
                      key={lang.code}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        lang.code === selectedLanguage
                          ? 'bg-gray-100 dark:bg-gray-700 font-medium'
                          : ''
                      }`}
                      onClick={() => handleSelectLanguage(lang.code)}
                    >
                      <span className="mr-1 text-xs">
                        {lang.supportLevel === 'full' ? (
                          <span className="text-green-500">●</span>
                        ) : lang.supportLevel === 'beta' ? (
                          <span className="text-yellow-500">●</span>
                        ) : (
                          <span className="text-red-500">●</span>
                        )}
                      </span>
                      {lang.name}
                      {showNativeNames && lang.nativeName && lang.name !== lang.nativeName && (
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                          ({lang.nativeName})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center mb-1">
                <span className="text-green-500 mr-1">●</span> Full Support
              </div>
              <div className="flex items-center mb-1">
                <span className="text-yellow-500 mr-1">●</span> Beta Support
              </div>
              <div className="flex items-center">
                <span className="text-red-500 mr-1">●</span> Limited Support
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Supported languages with their support level
// This is a comprehensive list of languages with their native names and support levels
const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', supportLevel: 'full', popular: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', supportLevel: 'full', popular: true },
  { code: 'fr', name: 'French', nativeName: 'Français', supportLevel: 'full', popular: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', supportLevel: 'full', popular: true },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', supportLevel: 'full', popular: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', supportLevel: 'full', popular: true },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', supportLevel: 'full' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', supportLevel: 'full', popular: true },
  { code: 'zh', name: 'Chinese', nativeName: '中文', supportLevel: 'full', popular: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', supportLevel: 'full', popular: true },
  { code: 'ko', name: 'Korean', nativeName: '한국어', supportLevel: 'full' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', supportLevel: 'beta', popular: true },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', supportLevel: 'beta', popular: true },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', supportLevel: 'beta' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', supportLevel: 'beta' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', supportLevel: 'beta' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', supportLevel: 'beta' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', supportLevel: 'beta' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', supportLevel: 'beta' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', supportLevel: 'beta' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', supportLevel: 'beta' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', supportLevel: 'beta' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', supportLevel: 'beta' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', supportLevel: 'beta' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', supportLevel: 'beta' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', supportLevel: 'beta' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', supportLevel: 'beta' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', supportLevel: 'limited' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', supportLevel: 'limited' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', supportLevel: 'limited' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', supportLevel: 'limited' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', supportLevel: 'limited' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', supportLevel: 'limited' },
  { code: 'eu', name: 'Basque', nativeName: 'Euskara', supportLevel: 'limited' },
  { code: 'gl', name: 'Galician', nativeName: 'Galego', supportLevel: 'limited' },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', supportLevel: 'limited' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', supportLevel: 'limited' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', supportLevel: 'limited' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', supportLevel: 'limited' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', supportLevel: 'limited' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', supportLevel: 'limited' }
];

export default LanguageSelector;
