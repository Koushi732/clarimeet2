import React, { useState } from 'react';
import { Session } from '../types';
import { exportAsMarkdown, exportAsPDF } from '../utils/exportUtils';
import { ArrowDownTrayIcon, DocumentTextIcon, DocumentIcon } from '@heroicons/react/24/outline';

interface SessionExportProps {
  session: Session;
  className?: string;
}

const SessionExport: React.FC<SessionExportProps> = ({ session, className = '' }) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportType, setExportType] = useState<'markdown' | 'pdf' | null>(null);
  
  const handleExport = async (type: 'markdown' | 'pdf') => {
    try {
      setIsExporting(true);
      setExportType(type);
      
      if (type === 'markdown') {
        exportAsMarkdown(session);
      } else if (type === 'pdf') {
        await exportAsPDF(session);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert(`Failed to export session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };
  
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        onClick={() => handleExport('markdown')}
        disabled={isExporting}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md 
          ${isExporting && exportType === 'markdown' 
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 cursor-wait' 
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700'}`}
      >
        {isExporting && exportType === 'markdown' ? (
          <>
            <svg className="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <DocumentTextIcon className="h-5 w-5" />
            Export Markdown
          </>
        )}
      </button>
      
      <button
        onClick={() => handleExport('pdf')}
        disabled={isExporting}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md 
          ${isExporting && exportType === 'pdf' 
            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 cursor-wait' 
            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700'}`}
      >
        {isExporting && exportType === 'pdf' ? (
          <>
            <svg className="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <DocumentIcon className="h-5 w-5" />
            Export PDF
          </>
        )}
      </button>
    </div>
  );
};

export default SessionExport;
