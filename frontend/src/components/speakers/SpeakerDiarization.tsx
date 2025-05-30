import React, { useState, useEffect, useCallback } from 'react';
import SpeakerBadge, { Speaker } from './SpeakerBadge';
import { DatabaseService } from '../../services/DatabaseService';
import { useSession } from '../../contexts/SessionContext';

export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  speakerId?: string;
  confidence?: number;
  startTime?: number;
  endTime?: number;
}

interface SpeakerDiarizationProps {
  transcripts: TranscriptSegment[];
  sessionId?: string;
  onSpeakerAssign?: (segmentId: string, speakerId: string) => void;
}

/**
 * Component for managing speaker identification and assignment for transcripts
 */
const SpeakerDiarization: React.FC<SpeakerDiarizationProps> = ({
  transcripts,
  sessionId,
  onSpeakerAssign
}) => {
  const { currentSession } = useSession();
  const activeSessionId = sessionId || currentSession?.session?.id;
  
  // Default speakers
  const [speakers, setSpeakers] = useState<Speaker[]>([
    { id: 'speaker-1', name: 'Speaker 1' },
    { id: 'speaker-2', name: 'Speaker 2' },
    { id: 'unknown', name: 'Unknown' }
  ]);
  
  // Track active speaker for editing
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Load speakers from database
  const loadSpeakers = useCallback(async () => {
    if (!activeSessionId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const sessionSpeakers = await DatabaseService.getSessionSpeakers(activeSessionId);
      
      if (sessionSpeakers && sessionSpeakers.length > 0) {
        // Transform to the component's Speaker format
        const formattedSpeakers = sessionSpeakers.map(speaker => ({
          id: speaker.id,
          name: speaker.name
        }));
        
        // Add unknown speaker if it doesn't exist
        if (!formattedSpeakers.some(speaker => speaker.id === 'unknown')) {
          formattedSpeakers.push({ id: 'unknown', name: 'Unknown' });
        }
        
        setSpeakers(formattedSpeakers);
      }
    } catch (err) {
      console.error('Error loading speakers:', err);
      setError('Failed to load speakers from database');
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId]);
  
  // Load speakers when session ID changes
  useEffect(() => {
    if (activeSessionId) {
      loadSpeakers();
    }
  }, [activeSessionId, loadSpeakers]);


  // Add a new speaker
  const addSpeaker = () => {
    const nextId = `speaker-${speakers.length + 1}`;
    const newSpeaker: Speaker = {
      id: nextId,
      name: `Speaker ${speakers.length + 1}`
    };
    
    setSpeakers([...speakers, newSpeaker]);
  };

  // Start editing a speaker's name
  const startEditSpeaker = (speakerId: string) => {
    setEditingSpeaker(speakerId);
    const speaker = speakers.find(s => s.id === speakerId);
    if (speaker) {
      setNewSpeakerName(speaker.name);
    }
  };

  // Save speaker name changes
  const saveSpeakerEdit = async () => {
    if (!editingSpeaker || !newSpeakerName.trim()) {
      setEditingSpeaker(null);
      return;
    }

    // Update local state first for immediate UI update
    setSpeakers(speakers.map(speaker => 
      speaker.id === editingSpeaker 
        ? { ...speaker, name: newSpeakerName } 
        : speaker
    ));
    
    // Save to database if session ID is available
    if (activeSessionId && editingSpeaker !== 'unknown') {
      try {
        await DatabaseService.updateSpeakerName(
          activeSessionId,
          editingSpeaker,
          newSpeakerName
        );
        console.log(`Updated speaker ${editingSpeaker} name to "${newSpeakerName}" in database`);
      } catch (err) {
        console.error('Error saving speaker name:', err);
        // Could show an error toast here
      }
    }
    
    setEditingSpeaker(null);
  };

  // Assign a speaker to a transcript segment
  const assignSpeaker = (segmentId: string, speakerId: string) => {
    if (onSpeakerAssign) {
      onSpeakerAssign(segmentId, speakerId);
    }
  };

  // Count segments by speaker
  const speakerSegmentCounts = transcripts.reduce((counts, segment) => {
    const speakerId = segment.speakerId || 'unknown';
    counts[speakerId] = (counts[speakerId] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Speakers</h3>
        <button 
          className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={addSpeaker}
        >
          Add Speaker
        </button>
      </div>

      {/* Speaker list */}
      <div className="space-y-2">
        {speakers.map(speaker => (
          <div 
            key={speaker.id} 
            className="flex items-center justify-between p-2 border rounded bg-gray-50 dark:bg-gray-800"
          >
            {editingSpeaker === speaker.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSpeakerName}
                  onChange={(e) => setNewSpeakerName(e.target.value)}
                  className="px-2 py-1 border rounded"
                  autoFocus
                  onBlur={saveSpeakerEdit}
                  onKeyDown={(e) => e.key === 'Enter' && saveSpeakerEdit()}
                />
                <button 
                  className="px-2 py-1 bg-green-500 text-white text-xs rounded"
                  onClick={saveSpeakerEdit}
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <SpeakerBadge speaker={speaker} />
                <button 
                  className="text-gray-500 hover:text-blue-500 text-xs"
                  onClick={() => startEditSpeaker(speaker.id)}
                >
                  Edit
                </button>
              </div>
            )}
            
            <div className="text-sm text-gray-500">
              {speakerSegmentCounts[speaker.id] || 0} segments
            </div>
          </div>
        ))}
      </div>

      {/* Transcript segments with speaker assignment */}
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-2">Transcript Segments</h3>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {transcripts.map(segment => (
            <div key={segment.id} className="p-3 border rounded">
              <div className="flex justify-between items-start mb-2">
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-500">
                    {new Date(segment.timestamp * 1000).toLocaleTimeString()}
                  </span>
                  {segment.speakerId ? (
                    <SpeakerBadge 
                      speaker={speakers.find(s => s.id === segment.speakerId) || { id: 'unknown', name: 'Unknown' }} 
                      size="small"
                    />
                  ) : (
                    <span className="text-xs text-gray-500">No speaker assigned</span>
                  )}
                </div>
                
                {/* Speaker assignment dropdown */}
                <select 
                  className="text-xs border rounded p-1" 
                  value={segment.speakerId || ''} 
                  onChange={(e) => assignSpeaker(segment.id, e.target.value)}
                >
                  <option value="">Assign speaker...</option>
                  {speakers.map(speaker => (
                    <option key={speaker.id} value={speaker.id}>
                      {speaker.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <p className="text-sm">{segment.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SpeakerDiarization;
