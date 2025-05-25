import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// Icons
import {
  MicrophoneIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  SparklesIcon,
  ClockIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

const HomePage = (): React.ReactElement => {
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
    },
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div
        className="text-center mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Welcome to{' '}
          <span className="text-primary-600 dark:text-primary-400">Clarimeet</span>
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
          Your AI-powered meeting companion for recording, transcribing, and summarizing
          conversations in real-time.
        </p>
      </motion.div>

      {/* Quick action cards */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants}>
          <Link
            to="/live"
            className="block h-full card bg-primary-50 dark:bg-primary-900/30 hover:bg-primary-100 dark:hover:bg-primary-900/50 hover:shadow-lg transition-all p-6 text-center"
            onClick={(e) => {
              // This will navigate to the live page but also make it clear this is the 'start immediately' option
              localStorage.setItem('start-recording-immediately', 'true');
            }}
          >
            <div className="inline-flex items-center justify-center p-3 bg-primary-100 dark:bg-primary-900 rounded-full mb-4">
              <MicrophoneIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Start Recording</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Record and transcribe a live meeting with real-time AI processing.
            </p>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link
            to="/upload"
            className="block h-full card hover:shadow-lg transition-shadow p-6 text-center"
          >
            <div className="inline-flex items-center justify-center p-3 bg-secondary-100 dark:bg-secondary-900 rounded-full mb-4">
              <ArrowUpTrayIcon className="h-8 w-8 text-secondary-600 dark:text-secondary-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Upload Audio</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Upload existing audio files for transcription and summarization.
            </p>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link
            to="/sessions"
            className="block h-full card hover:shadow-lg transition-shadow p-6 text-center"
          >
            <div className="inline-flex items-center justify-center p-3 bg-green-100 dark:bg-green-900 rounded-full mb-4">
              <DocumentTextIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">View Sessions</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Browse and manage your previous recordings and transcriptions.
            </p>
          </Link>
        </motion.div>
      </motion.div>

      {/* Features section */}
      <motion.div
        className="mb-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <h2 className="text-2xl font-bold text-center mb-8">
          Powerful Features
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <ComputerDesktopIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                System Audio Capture
              </h3>
              <p className="mt-1 text-gray-600 dark:text-gray-300">
                Record directly from your computer's audio output, including Zoom, Google
                Meet, and more.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0">
              <SparklesIcon className="h-6 w-6 text-secondary-600 dark:text-secondary-400" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                AI-Powered Summaries
              </h3>
              <p className="mt-1 text-gray-600 dark:text-gray-300">
                Get concise, meaningful summaries of your meetings using advanced AI
                models.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0">
              <ClockIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Real-Time Processing
              </h3>
              <p className="mt-1 text-gray-600 dark:text-gray-300">
                See transcriptions and summaries update in real-time as your conversation
                unfolds.
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="flex-shrink-0">
              <DocumentTextIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Export & Share
              </h3>
              <p className="mt-1 text-gray-600 dark:text-gray-300">
                Export your transcriptions and summaries in multiple formats for easy
                sharing.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Getting started */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Start recording or upload an audio file to see the magic happen.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Link
            to="/live"
            className="btn btn-primary px-6 py-3 text-lg"
          >
            Start Recording
          </Link>
          
          {/* Development Mode Button - No validation required */}
          <button
            onClick={() => {
              // Import these functions directly to avoid issues
              const { createMiniTab, createEnhancedMiniTab } = require('../utils/electronBridge');
              
              // Calculate screen width for positioning
              const screenWidth = window.screen.width;
              
              // First try to create the MiniTab
              createMiniTab({
                x: screenWidth - 320,
                y: 50,
                width: 300,
                height: 150
              });
              
              // Then create the enhanced version with more panels
              createEnhancedMiniTab({
                x: screenWidth - 370,
                y: 100,
                width: 320,
                height: 420
              });
            }}
            className="btn bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 text-lg"
          >
            Open UI Panels (Dev Mode)
          </button>
          
          <Link
            to="/upload"
            className="btn btn-outline px-6 py-3 text-lg"
          >
            Upload Audio
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default HomePage;
