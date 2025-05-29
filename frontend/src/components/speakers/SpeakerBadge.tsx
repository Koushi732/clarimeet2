import React from 'react';

export interface Speaker {
  id: string;
  name: string;
  color?: string;
}

interface SpeakerBadgeProps {
  speaker: Speaker;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

/**
 * A badge component for displaying speaker information
 */
const SpeakerBadge: React.FC<SpeakerBadgeProps> = ({ 
  speaker, 
  size = 'medium',
  onClick = undefined
}) => {
  // Generate a color based on speaker ID if not provided
  const speakerColor = speaker.color || generateColorFromId(speaker.id);
  
  // Size variants
  const sizeClasses = {
    small: 'text-xs px-2 py-0.5',
    medium: 'text-sm px-2.5 py-1',
    large: 'text-base px-3 py-1.5'
  };
  
  return (
    <span 
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses[size]} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      style={{ 
        backgroundColor: `${speakerColor}25`, // 25% opacity version of color
        color: speakerColor,
        border: `1px solid ${speakerColor}50` // 50% opacity border
      }}
      onClick={onClick}
    >
      {speaker.name}
    </span>
  );
};

/**
 * Generate a consistent color based on a string ID
 */
const generateColorFromId = (id: string): string => {
  // Pre-defined color palette for better UX than random colors
  const colors = [
    '#3B82F6', // blue
    '#10B981', // emerald
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // violet
    '#EC4899', // pink
    '#6366F1', // indigo
    '#D97706', // yellow
    '#0EA5E9', // sky
    '#14B8A6', // teal
  ];
  
  // Simple hash function to get a consistent index
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Ensure positive index
  hash = Math.abs(hash);
  return colors[hash % colors.length];
};

export default SpeakerBadge;
