import React, { useState, useEffect } from 'react';

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
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onLanguageChange,
  size = 'medium',
  showNativeNames = true
}) => {
  // Language history stored in localStorage
  const [recentLanguages, setRecentLanguages] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load recent languages from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('clarimeet_recent_languages');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentLanguages(parsed);
        }
      } catch (e) {
        console.error('Failed to parse recent languages:', e);
      }
    }
  }, []);

  // Update recent languages when selection changes
  const updateRecentLanguages = (languageCode: string) => {
    const updatedRecent = [
      languageCode,
      ...recentLanguages.filter(code => code !== languageCode)
    ].slice(0, 5); // Keep only 5 most recent languages
    
    setRecentLanguages(updatedRecent);
    localStorage.setItem('clarimeet_recent_languages', JSON.stringify(updatedRecent));
  };

  // Handle language selection
  const handleSelectLanguage = (languageCode: string) => {
    onLanguageChange(languageCode);
    updateRecentLanguages(languageCode);
    setIsOpen(false);
  };

  // Filter languages by search query
  const filteredLanguages = searchQuery
    ? SUPPORTED_LANGUAGES.filter(
        lang =>
          lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.nativeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SUPPORTED_LANGUAGES;

  // Group languages by support level and recent/popular status
  const recentLanguageItems = SUPPORTED_LANGUAGES.filter(lang => 
    recentLanguages.includes(lang.code)
  );

  const popularLanguageItems = SUPPORTED_LANGUAGES.filter(lang => 
    lang.popular && !recentLanguages.includes(lang.code)
  );

  const selectedLanguageDetails = SUPPORTED_LANGUAGES.find(
    lang => lang.code === selectedLanguage
  ) || SUPPORTED_LANGUAGES[0];

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
