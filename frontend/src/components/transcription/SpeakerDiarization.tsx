import React, { useState, useEffect, useCallback } from 'react';
import { 
  UserIcon, 
  PencilIcon, 
  TrashIcon, 
  PlusCircleIcon,
  UserGroupIcon
} from '@heroicons/react/24/solid';

interface Speaker {
  id: string;
  name: string;
  color: string;
}

interface TranscriptionSegment {
  id: string;
  text: string;
  timestamp: number;
  endTimestamp?: number;
  speakerId?: string;
  confidence?: number;
}

interface SpeakerDiarizationProps {
  segments: TranscriptionSegment[];
  onSegmentUpdate?: (segment: TranscriptionSegment) => void;
  onSpeakerCreate?: (speaker: Speaker) => void;
  onSpeakerUpdate?: (speaker: Speaker) => void;
  onSpeakerDelete?: (speakerId: string) => void;
  readOnly?: boolean;
}

// Default speaker colors
const DEFAULT_COLORS = [
  '#2563EB', // Blue
  '#DC2626', // Red
  '#059669', // Green
  '#D97706', // Amber
  '#7C3AED', // Purple
  '#DB2777', // Pink
  '#0891B2', // Cyan
  '#4B5563', // Gray
];

const SpeakerDiarization: React.FC<SpeakerDiarizationProps> = ({
  segments,
  onSegmentUpdate,
  onSpeakerCreate,
  onSpeakerUpdate,
  onSpeakerDelete,
  readOnly = false
}) => {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [isAddingSpeaker, setIsAddingSpeaker] = useState(false);
  
  // Extract unique speakers from segments on mount
  useEffect(() => {
    const uniqueSpeakerIds = new Set<string>();
    segments.forEach(segment => {
      if (segment.speakerId) {
        uniqueSpeakerIds.add(segment.speakerId);
      }
    });
    
    // Create speaker objects for any new speakers
    const existingSpeakerIds = new Set(speakers.map(s => s.id));
    const newSpeakers: Speaker[] = [];
    
    uniqueSpeakerIds.forEach(id => {
      if (!existingSpeakerIds.has(id)) {
        // Use a default naming convention for speakers
        const speakerName = `Speaker ${speakers.length + newSpeakers.length + 1}`;
        
        newSpeakers.push({
          id,
          name: speakerName,
          color: DEFAULT_COLORS[(speakers.length + newSpeakers.length) % DEFAULT_COLORS.length]
        });
      }
    });
    
    if (newSpeakers.length > 0) {
      setSpeakers(prev => [...prev, ...newSpeakers]);
    }
  }, [segments, speakers]);
  
  // Handle speaker assignment
  const assignSpeaker = useCallback((segmentId: string, speakerId: string) => {
    if (readOnly) return;
    
    const segment = segments.find(s => s.id === segmentId);
    if (segment && onSegmentUpdate) {
      onSegmentUpdate({
        ...segment,
        speakerId
      });
    }
  }, [segments, onSegmentUpdate, readOnly]);
  
  // Create a new speaker
  const createSpeaker = useCallback(() => {
    if (readOnly || !newSpeakerName.trim()) return;
    
    const newSpeaker: Speaker = {
      id: `speaker-${Date.now()}`,
      name: newSpeakerName,
      color: DEFAULT_COLORS[speakers.length % DEFAULT_COLORS.length]
    };
    
    setSpeakers(prev => [...prev, newSpeaker]);
    setNewSpeakerName('');
    setIsAddingSpeaker(false);
    
    if (onSpeakerCreate) {
      onSpeakerCreate(newSpeaker);
    }
  }, [newSpeakerName, speakers.length, onSpeakerCreate, readOnly]);
  
  // Update speaker name
  const updateSpeakerName = useCallback((id: string, name: string) => {
    if (readOnly) return;
    
    setSpeakers(prev => 
      prev.map(speaker => 
        speaker.id === id ? { ...speaker, name } : speaker
      )
    );
    
    const speaker = speakers.find(s => s.id === id);
    if (speaker && onSpeakerUpdate) {
      onSpeakerUpdate({ ...speaker, name });
    }
    
    setEditingSpeakerId(null);
  }, [speakers, onSpeakerUpdate, readOnly]);
  
  // Delete a speaker
  const deleteSpeaker = useCallback((id: string) => {
    if (readOnly) return;
    
    setSpeakers(prev => prev.filter(speaker => speaker.id !== id));
    
    if (onSpeakerDelete) {
      onSpeakerDelete(id);
    }
  }, [onSpeakerDelete, readOnly]);
  
  // Format timestamp as mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          <UserGroupIcon className="h-5 w-5 inline mr-2" />
          Speaker Diarization
        </h3>
        {!readOnly && (
          <button
            onClick={() => setIsAddingSpeaker(true)}
            className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 flex items-center text-sm"
          >
            <PlusCircleIcon className="h-4 w-4 mr-1" />
            Add Speaker
          </button>
        )}
      </div>
      
      {/* Speaker list */}
      <div className="bg-gray-50 dark:bg-dark-700 rounded-md p-3 space-y-2">
        {isAddingSpeaker && !readOnly && (
          <div className="flex items-center space-x-2 p-2 bg-white dark:bg-dark-600 rounded-md shadow-sm">
            <UserIcon className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={newSpeakerName}
              onChange={(e) => setNewSpeakerName(e.target.value)}
              placeholder="Speaker name"
              className="flex-1 bg-transparent focus:outline-none text-sm"
              autoFocus
            />
            <button
              onClick={createSpeaker}
              className="px-2 py-1 bg-primary-500 text-white rounded-md text-xs"
            >
              Add
            </button>
            <button
              onClick={() => {
                setNewSpeakerName('');
                setIsAddingSpeaker(false);
              }}
              className="px-2 py-1 bg-gray-200 dark:bg-dark-500 text-gray-700 dark:text-gray-300 rounded-md text-xs"
            >
              Cancel
            </button>
          </div>
        )}
        
        {speakers.map(speaker => (
          <div 
            key={speaker.id}
            className="flex items-center justify-between p-2 bg-white dark:bg-dark-600 rounded-md shadow-sm"
          >
            <div className="flex items-center space-x-2">
              <div 
                className="h-4 w-4 rounded-full flex-shrink-0" 
                style={{ backgroundColor: speaker.color }}
              />
              
              {editingSpeakerId === speaker.id ? (
                <input
                  type="text"
                  value={speaker.name}
                  onChange={(e) => {
                    setSpeakers(prev => 
                      prev.map(s => 
                        s.id === speaker.id ? { ...s, name: e.target.value } : s
                      )
                    );
                  }}
                  onBlur={() => updateSpeakerName(speaker.id, speaker.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateSpeakerName(speaker.id, speaker.name);
                    }
                  }}
                  className="bg-transparent focus:outline-none border-b border-primary-300 dark:border-primary-500 text-sm"
                  autoFocus
                />
              ) : (
                <span className="text-sm font-medium">{speaker.name}</span>
              )}
            </div>
            
            {!readOnly && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setEditingSpeakerId(speaker.id)}
                  className="p-1 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteSpeaker(speaker.id)}
                  className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        
        {speakers.length === 0 && (
          <div className="text-center py-3 text-gray-500 dark:text-gray-400 text-sm">
            No speakers identified yet. 
            {!readOnly && "Add speakers manually or they will be added automatically when segments are assigned."}
          </div>
        )}
      </div>
      
      {/* Transcription segments */}
      <div className="space-y-3 mt-4">
        <h4 className="font-medium text-gray-700 dark:text-gray-300">Transcription Segments</h4>
        
        <div className="bg-gray-50 dark:bg-dark-700 rounded-md divide-y divide-gray-200 dark:divide-dark-600 max-h-80 overflow-y-auto">
          {segments.map(segment => (
            <div key={segment.id} className="p-3 hover:bg-gray-100 dark:hover:bg-dark-600">
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {formatTime(segment.timestamp)}
                    {segment.endTimestamp && ` - ${formatTime(segment.endTimestamp)}`}
                  </span>
                  
                  {!readOnly && (
                    <select
                      value={segment.speakerId || ''}
                      onChange={(e) => assignSpeaker(segment.id, e.target.value)}
                      className="text-xs bg-white dark:bg-dark-500 border border-gray-300 dark:border-dark-600 rounded-md py-0.5 px-1"
                    >
                      <option value="">Assign speaker</option>
                      {speakers.map(speaker => (
                        <option key={speaker.id} value={speaker.id}>
                          {speaker.name}
                        </option>
                      ))}
                    </select>
                  )}
                  
                  {segment.speakerId && (
                    <div className="flex items-center space-x-1">
                      <div 
                        className="h-3 w-3 rounded-full" 
                        style={{ 
                          backgroundColor: speakers.find(s => s.id === segment.speakerId)?.color || '#CBD5E0' 
                        }}
                      />
                      <span className="text-xs font-medium">
                        {speakers.find(s => s.id === segment.speakerId)?.name || 'Unknown'}
                      </span>
                    </div>
                  )}
                </div>
                
                {segment.confidence !== undefined && (
                  <span className="text-xs bg-gray-200 dark:bg-dark-600 rounded-full px-2 py-0.5">
                    {Math.round(segment.confidence * 100)}%
                  </span>
                )}
              </div>
              
              <p className="text-sm text-gray-800 dark:text-gray-200">{segment.text}</p>
            </div>
          ))}
          
          {segments.length === 0 && (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              No transcription segments available
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpeakerDiarization;
