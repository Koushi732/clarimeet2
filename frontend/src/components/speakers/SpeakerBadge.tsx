import React, { useEffect, useState, useCallback } from 'react';
import { DatabaseService } from '../../services/DatabaseService';

export interface Speaker {
  id: string;
  name: string;
  color?: string;
}

interface SpeakerBadgeProps {
  speaker: Speaker;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  sessionId?: string;
  userId?: string;
  persistColor?: boolean; // Whether to save color preferences to database
}

/**
 * A badge component for displaying speaker information
 * Supports database integration for persistent speaker colors
 */
const SpeakerBadge: React.FC<SpeakerBadgeProps> = ({ 
  speaker, 
  size = 'medium',
  onClick = undefined,
  sessionId = undefined,
  userId = 'default-user',
  persistColor = false
}) => {
  const [speakerColor, setSpeakerColor] = useState<string | null>(speaker.color || null);
  const [isLoading, setIsLoading] = useState(false);

  // Load speaker color from database if available
  const loadSpeakerColor = useCallback(async () => {
    if (!persistColor || !sessionId || !speaker.id) return;
    
    setIsLoading(true);
    try {
      // First try to get from session settings (preferred approach)
      if (sessionId) {
        const speakerSettings = await DatabaseService.getSessionSetting(sessionId, `speaker_color_${speaker.id}`);
        if (speakerSettings && speakerSettings.value && speakerSettings.value.color) {
          setSpeakerColor(speakerSettings.value.color);
          return;
        }
      }
      
      // Fallback to user settings for backward compatibility
      const speakerSettings = await DatabaseService.getSetting(
        userId,
        `speaker_color_${sessionId}_${speaker.id}`
      );
      
      if (speakerSettings && speakerSettings.color) {
        setSpeakerColor(speakerSettings.color);
        // Migrate to session settings
        if (sessionId) {
          await DatabaseService.saveSessionSetting(sessionId, `speaker_color_${speaker.id}`, { color: speakerSettings.color });
        }
        return;
      }
    } catch (error) {
      console.error('Error loading speaker color:', error);
    } finally {
      setIsLoading(false);
    }
  }, [persistColor, sessionId, speaker.id, userId]);

  // Save speaker color to database
  const saveSpeakerColor = useCallback(async (color: string) => {
    if (!persistColor || !sessionId || !speaker.id) return;
    
    try {
      // Save to session settings (preferred approach)
      if (sessionId) {
        await DatabaseService.saveSessionSetting(
          sessionId,
          `speaker_color_${speaker.id}`,
          { color }
        );
      }
      
      // Also save to user settings for backward compatibility
      await DatabaseService.updateSetting(
        userId,
        `speaker_color_${sessionId}_${speaker.id}`,
        { color }
      );
    } catch (error) {
      console.error('Error saving speaker color:', error);
    }
  }, [persistColor, sessionId, speaker.id, userId]);

  // Load color from database on component mount
  useEffect(() => {
    loadSpeakerColor();
  }, [loadSpeakerColor]);

  // Get final color - use loaded color, provided color, or generate one
  const finalColor = speakerColor || generateColorFromId(speaker.id);
  
  // When color changes and it's different from what we already have, save it
  useEffect(() => {
    if (speaker.color && speaker.color !== speakerColor) {
      setSpeakerColor(speaker.color);
      if (persistColor) {
        saveSpeakerColor(speaker.color);
      }
    }
  }, [speaker.color, speakerColor, persistColor, saveSpeakerColor]);
  
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
        backgroundColor: `${finalColor}25`, // 25% opacity version of color
        color: finalColor,
        border: `1px solid ${finalColor}50` // 50% opacity border
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
