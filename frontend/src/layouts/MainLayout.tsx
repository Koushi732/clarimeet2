import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';

// Icons
import {
  HomeIcon,
  MicrophoneIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  FolderIcon,
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const MainLayout = (): React.ReactElement => {
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  
  const navItems = [
    { name: 'Home', to: '/', icon: HomeIcon },
    { name: 'Live Recording', to: '/live', icon: MicrophoneIcon },
    { name: 'Upload Audio', to: '/upload', icon: ArrowUpTrayIcon },
    { name: 'Summary', to: '/summary', icon: DocumentTextIcon },
    { name: 'Sessions', to: '/sessions', icon: FolderIcon },
    { name: 'Settings', to: '/settings', icon: Cog6ToothIcon },
  ];
  
  // Animation variants
  const sidebarVariants = {
    open: { x: 0 },
    closed: { x: '-100%' }
  };
  
  const contentVariants = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  return (
    <div className="min-h-screen flex">
      {/* Mobile menu button */}
      <div className="fixed top-4 left-4 z-50 md:hidden">
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-md bg-white dark:bg-dark-700 shadow-md"
        >
          {isMobileMenuOpen ? (
            <XMarkIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
          ) : (
            <Bars3Icon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
          )}
        </button>
      </div>
      
      {/* Sidebar - desktop */}
      <div className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 bg-white dark:bg-dark-700 shadow-lg">
        <div className="flex items-center justify-center h-16 border-b border-gray-200 dark:border-dark-600">
          <h1 className="text-xl font-bold text-primary-600 dark:text-primary-500">Clarimeet</h1>
        </div>
        <div className="flex-grow flex flex-col justify-between p-4">
          <nav className="space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-600 dark:bg-dark-600 dark:text-primary-400'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-600'
                  }`
                }
              >
                <item.icon className="h-5 w-5 mr-3" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </nav>
          <div className="pt-4 border-t border-gray-200 dark:border-dark-600">
            <button
              onClick={toggleTheme}
              className="flex items-center w-full px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-600"
            >
              {theme === 'dark' ? (
                <>
                  <SunIcon className="h-5 w-5 mr-3 text-yellow-500" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <MoonIcon className="h-5 w-5 mr-3 text-indigo-500" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Sidebar - mobile */}
      <motion.div
        className="md:hidden fixed inset-0 z-40 flex"
        initial="closed"
        animate={isMobileMenuOpen ? 'open' : 'closed'}
        variants={sidebarVariants}
      >
        {/* Backdrop */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
        
        {/* Sidebar */}
        <div className="relative flex-1 flex flex-col w-80 max-w-xs bg-white dark:bg-dark-700 shadow-xl">
          <div className="flex items-center justify-between h-16 border-b border-gray-200 dark:border-dark-600 px-4">
            <h1 className="text-xl font-bold text-primary-600 dark:text-primary-500">Clarimeet</h1>
            <button onClick={() => setIsMobileMenuOpen(false)}>
              <XMarkIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
          <div className="flex-grow flex flex-col justify-between p-4">
            <nav className="space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-600 dark:bg-dark-600 dark:text-primary-400'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-600'
                    }`
                  }
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <item.icon className="h-5 w-5 mr-3" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </nav>
            <div className="pt-4 border-t border-gray-200 dark:border-dark-600">
              <button
                onClick={toggleTheme}
                className="flex items-center w-full px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-600"
              >
                {theme === 'dark' ? (
                  <>
                    <SunIcon className="h-5 w-5 mr-3 text-yellow-500" />
                    <span>Light Mode</span>
                  </>
                ) : (
                  <>
                    <MoonIcon className="h-5 w-5 mr-3 text-indigo-500" />
                    <span>Dark Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      
      {/* Main content */}
      <div className="flex-1 md:ml-64 mt-16 md:mt-0">
        <motion.main
          className="p-6"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={contentVariants}
          key={location.pathname}
          transition={{ duration: 0.2 }}
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
};

export default MainLayout;
