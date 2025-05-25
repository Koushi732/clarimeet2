import React, { useState, useEffect } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';

interface FallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

const ErrorFallback: React.FC<FallbackProps> = ({ error, resetErrorBoundary }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 bg-red-50 dark:bg-red-900/20 rounded-lg">
      <ExclamationTriangleIcon className="w-16 h-16 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">
        Something went wrong
      </h2>
      <p className="text-gray-600 dark:text-gray-300 mb-4 text-center">
        An error occurred in this component. Please try refreshing the page or contact support if the issue persists.
      </p>
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md w-full max-w-2xl overflow-auto text-sm font-mono">
        <p className="text-red-600 dark:text-red-400">{error.message || error.toString()}</p>
      </div>
      <div className="mt-6 flex space-x-4">
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Refresh Page
        </button>
        <button
          onClick={resetErrorBoundary}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({ children, fallback }) => {
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      console.error('Caught error:', event.error);
      setError(event.error || new Error('Unknown error occurred'));
      event.preventDefault();
    };
    
    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);
  
  if (error) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <ErrorFallback error={error} resetErrorBoundary={() => setError(null)} />;
  }
  
  return <>{children}</>;
};

export default ErrorBoundary;
