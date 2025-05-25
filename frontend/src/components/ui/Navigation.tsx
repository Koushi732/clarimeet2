import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HomeIcon,
  MicrophoneIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  FolderIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const NavItem = ({ to, icon, label }: NavItemProps): React.ReactElement => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center py-3 px-4 rounded-lg transition-all duration-200 ${
          isActive
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
            : 'hover:bg-gray-100 dark:hover:bg-dark-700 text-gray-700 dark:text-gray-300'
        }`
      }
    >
      <div className="w-6 h-6 mr-3">{icon}</div>
      <span className="font-medium">{label}</span>
    </NavLink>
  );
};

const Navigation = (): React.ReactElement => {
  return (
    <motion.nav
      className="p-3 bg-white dark:bg-dark-800 rounded-lg shadow-sm"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="space-y-1">
        <NavItem to="/" icon={<HomeIcon />} label="Home" />
        <NavItem to="/live" icon={<MicrophoneIcon />} label="Live Recording" />
        <NavItem to="/upload" icon={<ArrowUpTrayIcon />} label="Upload Audio" />
        <NavItem to="/summary" icon={<DocumentTextIcon />} label="Summaries" />
        <NavItem to="/sessions" icon={<FolderIcon />} label="Sessions" />
        <NavItem to="/settings" icon={<Cog6ToothIcon />} label="Settings" />
      </div>
    </motion.nav>
  );
};

export default Navigation;
