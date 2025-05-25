import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAudio } from '../contexts/AudioContext';
import { useSession } from '../contexts/SessionContext';
import { useSettingsContext } from '../contexts/SettingsContext';
import AudioVisualizer from '../components/ui/AudioVisualizer';

// Icons
import {
  ArrowUpTrayIcon,
  DocumentIcon,
  XCircleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/solid';

const UploadPage = (): React.ReactElement => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  
  const { uploadAudio, isLoading, error, getAudioLevel } = useAudio();
  const { setCurrentSession } = useSession();
  const { settings } = useSettingsContext();
  
  // Drag event handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);
  
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);
  
  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);
  
  // Handle file selection
  const handleFileSelect = useCallback((selectedFile: File) => {
    // Reset error state
    setUploadError(null);
    
    // Check file type
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg', 'audio/m4a', 'audio/flac', ''];
    
    // For files without proper MIME type, check extension
    const validExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a'];
    const hasValidExtension = validExtensions.some(ext => 
      selectedFile.name.toLowerCase().endsWith(ext)
    );
    
    if (!validTypes.includes(selectedFile.type) && !hasValidExtension) {
      setUploadError('Please select a valid audio file (MP3, WAV, OGG, FLAC, M4A)');
      return;
    }
    
    // Check file size (500MB max)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (selectedFile.size > maxSize) {
      setUploadError(`File is too large. Maximum size is ${formatFileSize(maxSize)}.`);
      return;
    }
    
    // Set file and automatically generate a title if not set
    setFile(selectedFile);
    
    if (!title) {
      // Extract file name without extension
      const fileName = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(fileName);
    }
  }, [title]);
  
  // Trigger file input click
  const handleBrowseClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);
  
  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  }, [handleFileSelect]);
  
  // Handle file upload
  const handleUpload = async () => {
    if (!file) {
      setUploadError('Please select a file to upload');
      return;
    }
    
    if (!title.trim()) {
      setUploadError('Please enter a title for the session');
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    
    // Simulate progress (in a real app, this would come from the upload API)
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        const newProgress = prev + Math.random() * 10;
        return newProgress >= 95 ? 95 : newProgress;
      });
    }, 300);
    
    try {
      // Upload the file
      const sessionId = await uploadAudio(
        file, 
        title, 
        description || undefined
      );
      
      // Set progress to 100% when complete
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      // If we have a session ID, the upload was successful
      if (sessionId) {
        // Update current session in context
        setCurrentSession(sessionId);
        
        // Redirect to the session details page after a short delay
        setTimeout(() => {
          navigate(`/sessions/${sessionId}`);
        }, 1500);
      }
    } catch (err) {
      console.error('Error uploading audio:', err);
      setUploadError('Failed to upload audio file. Please try again.');
      clearInterval(progressInterval);
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
    }
  };
  
  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
          Upload Audio
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Upload audio files for transcription and summarization
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Upload form */}
        <div className="md:col-span-2">
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Upload Audio File</h2>
            <div className="space-y-6">
              {/* Drag and drop area */}
              <div
                className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors ${dragActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-dark-500 hover:bg-gray-50 dark:hover:bg-dark-600'}`}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleBrowseClick}
              >
                <input
                  type="file"
                  className="hidden"
                  accept=".mp3,.wav,.ogg,.flac,.m4a,audio/*"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                />
                
                <ArrowUpTrayIcon className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-3" />
                
                <p className="text-gray-700 dark:text-gray-300 font-medium text-center mb-1">
                  Drag and drop your audio file here
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm text-center mb-4">
                  or click to browse
                </p>
                
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowseClick();
                  }}
                >
                  Browse Files
                </button>
              </div>
              
              {/* Session details */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="label">Title</label>
                  <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="input"
                    placeholder="Enter a title for this session"
                    disabled={isUploading}
                  />
                </div>
                
                <div>
                  <label htmlFor="description" className="label">Description (Optional)</label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="input h-24"
                    placeholder="Enter a description for this session"
                    disabled={isUploading}
                  />
                </div>
              </div>
              
              {/* File information */}
              {/* Audio visualizer - only shown when a file is selected */}
              {file && (
                <div className="mb-4">
                  <AudioVisualizer 
                    audioLevel={isUploading ? getAudioLevel() : 0.05}
                    isRecording={isUploading}
                    barCount={30}
                    height={60}
                    className="rounded-lg overflow-hidden"
                  />
                </div>
              )}
              
              {/* File information */}
              {file && (
                <div className="bg-gray-50 dark:bg-dark-700 rounded-lg p-4 flex items-start">
                  <DocumentIcon className="h-8 w-8 text-primary-500 mr-3 flex-shrink-0" />
                  
                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {file.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      
                      <button
                        className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          setUploadProgress(0);
                        }}
                        disabled={isUploading}
                        aria-label="Remove file"
                      >
                        <XCircleIcon className="h-5 w-5" />
                      </button>
                    </div>
                    
                    {isUploading && (
                      <div className="mt-2">
                        <div className="h-2 bg-gray-200 dark:bg-dark-600 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-primary-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress}%` }}
                            transition={{ ease: "easeInOut" }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {uploadProgress < 100 ? 'Uploading...' : 'Processing...'} ({Math.round(uploadProgress)}%)
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {(uploadError || error) && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-sm flex items-start">
                  <ExclamationCircleIcon className="h-5 w-5 mr-2 flex-shrink-0" />
                  <span>{uploadError || error}</span>
                </div>
              )}
              
              <div className="pt-4">
                <motion.button
                  onClick={handleUpload}
                  disabled={!file || !title.trim() || isUploading || isLoading}
                  className={`btn w-full flex items-center justify-center ${!file || !title.trim() || isUploading || isLoading ? 'btn-disabled' : 'btn-primary'}`}
                  whileTap={!file || !title.trim() || isUploading || isLoading ? {} : { scale: 0.98 }}
                  whileHover={!file || !title.trim() || isUploading || isLoading ? {} : { scale: 1.01 }}
                >
                  {isUploading || isLoading ? (
                    <>
                      <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                      {uploadProgress < 100 ? 'Uploading...' : 'Processing...'}
                    </>
                  ) : (
                    <>
                      <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
                      Upload and Process
                    </>
                  )}
                </motion.button>
                
                {file && settings && (
                  <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    <p>
                      {settings.autoTranscribe ? (
                        <>Will automatically transcribe using <span className="font-mono">{settings.transcriptionModel}</span></>
                      ) : (
                        'Automatic transcription is disabled'
                      )}
                    </p>
                    <p>
                      {settings.autoSummarize ? (
                        <>Will automatically summarize using <span className="font-mono">{settings.summarizationModel}</span></>
                      ) : (
                        'Automatic summarization is disabled'
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Information panel */}
        <div>
          <div className="card p-6">
            <h2 className="text-xl font-semibold mb-4">Upload Information</h2>
            
            <ul className="space-y-4 text-gray-600 dark:text-gray-300">
              <motion.li 
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
              >
                <DocumentIcon className="h-5 w-5 text-primary-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-gray-800 dark:text-gray-200">Supported Formats</strong>
                  MP3, WAV, OGG, FLAC, M4A audio files
                </span>
              </motion.li>
              
              <motion.li 
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <DocumentIcon className="h-5 w-5 text-primary-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-gray-800 dark:text-gray-200">File Size</strong>
                  Maximum file size: 500MB
                </span>
              </motion.li>
              
              <motion.li 
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <DocumentIcon className="h-5 w-5 text-primary-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-gray-800 dark:text-gray-200">Processing</strong>
                  {settings.autoTranscribe && settings.autoSummarize ? (
                    'Audio will be automatically transcribed and summarized after upload'
                  ) : settings.autoTranscribe ? (
                    'Audio will be automatically transcribed after upload'
                  ) : settings.autoSummarize ? (
                    'Audio will be automatically summarized after upload'
                  ) : (
                    'Automatic processing is disabled in settings'
                  )}
                </span>
              </motion.li>
              
              <motion.li 
                className="flex items-start"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <ExclamationCircleIcon className="h-5 w-5 text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-gray-800 dark:text-gray-200">Processing Time</strong>
                  Processing time depends on file length. A 60-minute recording may take 5-10 minutes to process.
                </span>
              </motion.li>
            </ul>
            
            <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">
                Tips for Best Results
              </h3>
              <ul className="space-y-2 text-blue-700 dark:text-blue-400 text-sm">
                <li className="flex items-start">
                  <CheckCircleIcon className="h-4 w-4 mr-1 flex-shrink-0 mt-0.5" />
                  <span>Use high-quality audio with minimal background noise</span>
                </li>
                <li className="flex items-start">
                  <CheckCircleIcon className="h-4 w-4 mr-1 flex-shrink-0 mt-0.5" />
                  <span>Clear speech with minimal overlapping speakers</span>
                </li>
                <li className="flex items-start">
                  <CheckCircleIcon className="h-4 w-4 mr-1 flex-shrink-0 mt-0.5" />
                  <span>Add descriptive title for easier organization</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;