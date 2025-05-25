import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PencilIcon, TrashIcon, CheckIcon, ClockIcon } from '@heroicons/react/24/solid';

interface NotebookPanelProps {
  session: any; // Using any for now, should be properly typed with your session interface
}

interface Note {
  id: string;
  text: string;
  timestamp: number;
  sessionId: string;
}

const NotebookPanel: React.FC<NotebookPanelProps> = ({ session }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentNote, setCurrentNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  
  // Load notes from localStorage when session changes
  useEffect(() => {
    if (session?.session?.id) {
      const savedNotes = localStorage.getItem(`clariimeet-notes-${session.session.id}`);
      if (savedNotes) {
        try {
          setNotes(JSON.parse(savedNotes));
        } catch (e) {
          console.error('Failed to parse saved notes:', e);
          setNotes([]);
        }
      }
    } else {
      setNotes([]);
    }
  }, [session?.session?.id]);
  
  // Save notes to localStorage when they change
  useEffect(() => {
    if (session?.session?.id && notes.length > 0) {
      localStorage.setItem(`clariimeet-notes-${session.session.id}`, JSON.stringify(notes));
    }
  }, [notes, session?.session?.id]);

  const handleAddNote = () => {
    if (!currentNote.trim() || !session?.session?.id) return;
    
    const newNote: Note = {
      id: `note-${Date.now()}`,
      text: currentNote,
      timestamp: Date.now(),
      sessionId: session.session.id
    };
    
    setNotes(prev => [newNote, ...prev]);
    setCurrentNote('');
  };
  
  const handleEditNote = (noteId: string) => {
    const noteToEdit = notes.find(note => note.id === noteId);
    if (noteToEdit) {
      setCurrentNote(noteToEdit.text);
      setEditingNoteId(noteId);
    }
  };
  
  const handleSaveEdit = () => {
    if (!editingNoteId || !currentNote.trim()) return;
    
    setNotes(prev => prev.map(note => 
      note.id === editingNoteId 
        ? { ...note, text: currentNote, timestamp: Date.now() }
        : note
    ));
    
    setCurrentNote('');
    setEditingNoteId(null);
  };
  
  const handleDeleteNote = (noteId: string) => {
    setNotes(prev => prev.filter(note => note.id !== noteId));
    
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
      setCurrentNote('');
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (editingNoteId) {
        handleSaveEdit();
      } else {
        handleAddNote();
      }
    }
  };

  if (!session?.session) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
        <PencilIcon className="h-10 w-10 mb-2 opacity-50" />
        <p className="text-sm">No active session</p>
        <p className="text-xs mt-1">Start a session to take notes</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-medium text-primary-700 dark:text-primary-400">
          Session Notes
        </h3>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {notes.length} {notes.length === 1 ? 'note' : 'notes'}
        </div>
      </div>
      
      <div className="mb-2">
        <div className="relative">
          <textarea
            value={currentNote}
            onChange={(e) => setCurrentNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={editingNoteId ? "Edit your note..." : "Write a new note..."}
            className="w-full p-2 border border-gray-300 dark:border-dark-500 rounded-md bg-white dark:bg-dark-600 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm min-h-[60px] resize-none"
          />
          <div className="flex justify-between mt-1 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Press Ctrl+Enter to {editingNoteId ? 'save' : 'add'}
            </span>
            <div className="space-x-1">
              {editingNoteId && (
                <button
                  onClick={() => {
                    setEditingNoteId(null);
                    setCurrentNote('');
                  }}
                  className="px-2 py-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={editingNoteId ? handleSaveEdit : handleAddNote}
                disabled={!currentNote.trim()}
                className="px-2 py-1 bg-primary-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingNoteId ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-y-auto max-h-48 bg-gray-50 dark:bg-dark-700 rounded-md p-2 text-sm">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-gray-400 dark:text-gray-500">
            <p className="text-sm">No notes yet</p>
            <p className="text-xs mt-1">Write your first note above</p>
          </div>
        ) : (
          notes.map((note) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-2 p-2 bg-white dark:bg-dark-600 rounded-md shadow-sm border border-gray-200 dark:border-dark-700"
            >
              <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{note.text}</div>
              <div className="flex justify-between items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center">
                  <ClockIcon className="h-3 w-3 mr-1" />
                  {new Date(note.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditNote(note.id)}
                    className="text-gray-500 hover:text-primary-500 dark:text-gray-400 dark:hover:text-primary-400"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotebookPanel;
