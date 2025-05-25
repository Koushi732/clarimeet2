/**
 * Global Error Handler for Clarimeet
 * Provides consistent error handling across the application
 */

import axios, { AxiosError } from 'axios';

// Error severity levels
export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Error categories for better organization
export enum ErrorCategory {
  NETWORK = 'network',
  API = 'api',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  VALIDATION = 'validation',
  APPLICATION = 'application',
  UNKNOWN = 'unknown'
}

// Error interface
export interface AppError {
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: Date;
  originalError?: any;
  context?: Record<string, any>;
}

// Error history for debugging
const errorHistory: AppError[] = [];
const MAX_ERROR_HISTORY = 50;

/**
 * Handle API errors consistently
 */
export function handleApiError(error: unknown, context?: Record<string, any>): AppError {
  let appError: AppError;
  
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    
    // Network errors
    if (!axiosError.response) {
      appError = {
        message: 'Network error: Unable to connect to the server',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.ERROR,
        timestamp: new Date(),
        originalError: error,
        context
      };
    } 
    // API errors with response
    else {
      const status = axiosError.response.status;
      
      // Authentication errors
      if (status === 401) {
        appError = {
          message: 'Authentication error: Your session may have expired',
          category: ErrorCategory.AUTHENTICATION,
          severity: ErrorSeverity.WARNING,
          timestamp: new Date(),
          originalError: error,
          context
        };
      } 
      // Permission errors
      else if (status === 403) {
        appError = {
          message: 'Permission error: You do not have access to this resource',
          category: ErrorCategory.PERMISSION,
          severity: ErrorSeverity.WARNING,
          timestamp: new Date(),
          originalError: error,
          context
        };
      } 
      // Validation errors
      else if (status === 400 || status === 422) {
        appError = {
          message: 'Validation error: Please check your input data',
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.WARNING,
          timestamp: new Date(),
          originalError: error,
          context
        };
      } 
      // Server errors
      else if (status >= 500) {
        appError = {
          message: 'Server error: The server encountered an error',
          category: ErrorCategory.API,
          severity: ErrorSeverity.ERROR,
          timestamp: new Date(),
          originalError: error,
          context
        };
      } 
      // Other API errors
      else {
        appError = {
          message: `API error: ${axiosError.message}`,
          category: ErrorCategory.API,
          severity: ErrorSeverity.ERROR,
          timestamp: new Date(),
          originalError: error,
          context
        };
      }
    }
  } 
  // Non-Axios errors
  else {
    appError = {
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.ERROR,
      timestamp: new Date(),
      originalError: error,
      context
    };
  }
  
  // Add to history
  addToErrorHistory(appError);
  
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Clarimeet Error]', appError);
  }
  
  return appError;
}

/**
 * Handle application errors
 */
export function handleAppError(error: unknown, category: ErrorCategory = ErrorCategory.APPLICATION, context?: Record<string, any>): AppError {
  const appError: AppError = {
    message: error instanceof Error ? error.message : 'An application error occurred',
    category,
    severity: ErrorSeverity.ERROR,
    timestamp: new Date(),
    originalError: error,
    context
  };
  
  // Add to history
  addToErrorHistory(appError);
  
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Clarimeet Error]', appError);
  }
  
  return appError;
}

/**
 * Add error to history, maintaining maximum size
 */
function addToErrorHistory(error: AppError): void {
  errorHistory.unshift(error);
  
  if (errorHistory.length > MAX_ERROR_HISTORY) {
    errorHistory.pop();
  }
}

/**
 * Get error history for debugging
 */
export function getErrorHistory(): AppError[] {
  return [...errorHistory];
}

/**
 * Clear error history
 */
export function clearErrorHistory(): void {
  errorHistory.length = 0;
}

/**
 * Format error message for user display
 */
export function formatErrorForUser(error: AppError): string {
  // Simplified user-friendly message
  return error.message;
}
