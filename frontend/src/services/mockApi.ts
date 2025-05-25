import { v4 as uuidv4 } from 'uuid';

// Mock data
const mockSessions = [
  {
    id: "session-1",
    title: "Weekly Team Meeting",
    description: "Discussion about project progress and next steps",
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    duration: 45 * 60, // 45 minutes in seconds
    status: "completed",
    audioPath: "/mock/audio1.mp3",
    hasTranscription: true,
    hasSummary: true
  },
  {
    id: "session-2",
    title: "Client Presentation",
    description: "Presenting the new product features to the client",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    duration: 60 * 60, // 60 minutes in seconds
    status: "completed",
    audioPath: "/mock/audio2.mp3",
    hasTranscription: true,
    hasSummary: true
  },
  {
    id: "session-3",
    title: "Brainstorming Session",
    description: "Ideation for the new project",
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    duration: 30 * 60, // 30 minutes in seconds
    status: "completed",
    audioPath: "/mock/audio3.mp3",
    hasTranscription: true,
    hasSummary: false
  }
];

const mockTranscriptions = {
  "session-1": [
    { id: "t1", text: "Hello everyone, thanks for joining today's meeting.", timestamp: 0, speaker: "Speaker 1" },
    { id: "t2", text: "Let's start by going through the project status.", timestamp: 5, speaker: "Speaker 1" },
    { id: "t3", text: "The frontend team has completed the new UI components.", timestamp: 10, speaker: "Speaker 2" },
    { id: "t4", text: "Great, and how about the backend integration?", timestamp: 15, speaker: "Speaker 1" },
    { id: "t5", text: "We're on track, API endpoints are 80% complete.", timestamp: 20, speaker: "Speaker 3" },
    // Add more mock transcription entries as needed
  ],
  "session-2": [
    { id: "t1", text: "Welcome to our presentation on the new features.", timestamp: 0, speaker: "Speaker 1" },
    { id: "t2", text: "We've added several exciting improvements to the platform.", timestamp: 5, speaker: "Speaker 1" },
    { id: "t3", text: "The first new feature is real-time collaboration.", timestamp: 10, speaker: "Speaker 1" },
    { id: "t4", text: "That looks impressive. How does it handle conflicts?", timestamp: 15, speaker: "Speaker 2" },
    { id: "t5", text: "Great question. We use a conflict resolution algorithm.", timestamp: 20, speaker: "Speaker 1" },
    // Add more mock transcription entries as needed
  ],
  "session-3": [
    { id: "t1", text: "Let's brainstorm ideas for the new project.", timestamp: 0, speaker: "Speaker 1" },
    { id: "t2", text: "I think we should focus on mobile-first approach.", timestamp: 5, speaker: "Speaker 2" },
    { id: "t3", text: "That makes sense. What about accessibility features?", timestamp: 10, speaker: "Speaker 3" },
    { id: "t4", text: "Yes, accessibility should be a priority from day one.", timestamp: 15, speaker: "Speaker 1" },
    { id: "t5", text: "I agree. Let's list the key accessibility requirements.", timestamp: 20, speaker: "Speaker 2" },
    // Add more mock transcription entries as needed
  ]
};

const mockSummaries = {
  "session-1": {
    overall: "This meeting focused on project status updates. The frontend team has completed UI components, and backend API endpoints are 80% complete. The team discussed next steps and assigned action items for the coming week.",
    keyPoints: [
      "Frontend UI components completed",
      "Backend API endpoints 80% complete",
      "Team discussed next steps",
      "Action items assigned for next week"
    ],
    actionItems: [
      "Frontend team to start integration testing",
      "Backend team to complete remaining API endpoints",
      "Project manager to update timeline",
      "Schedule follow-up meeting next week"
    ]
  },
  "session-2": {
    overall: "This presentation introduced new platform features to the client, including real-time collaboration. The client asked questions about conflict resolution and implementation timeline. Overall reception was positive.",
    keyPoints: [
      "Introduced real-time collaboration feature",
      "Discussed conflict resolution approach",
      "Client reception was positive",
      "Implementation timeline shared"
    ],
    actionItems: [
      "Send follow-up documentation to client",
      "Schedule technical deep-dive for next week",
      "Prepare demo environment for client testing",
      "Collect feedback after initial client testing"
    ]
  }
};

const mockAudioDevices = [
  { id: "device-1", name: "Default Microphone", isDefault: true, type: "input" },
  { id: "device-2", name: "Headset Microphone", isDefault: false, type: "input" },
  { id: "device-3", name: "System Audio", isDefault: true, type: "loopback" },
  { id: "device-4", name: "External Microphone", isDefault: false, type: "input" }
];

// Mock API implementations
export const mockAudioApi = {
  getDevices: () => Promise.resolve({ data: mockAudioDevices }),
  
  startRecording: (deviceId: string, title: string, description?: string, loopback = true) => {
    const sessionId = uuidv4();
    return Promise.resolve({ 
      data: { 
        sessionId,
        deviceId,
        title,
        description,
        loopback,
        status: "recording",
        startedAt: new Date().toISOString()
      } 
    });
  },
  
  stopRecording: (sessionId: string) => {
    return Promise.resolve({ 
      data: { 
        sessionId,
        status: "completed",
        duration: Math.floor(Math.random() * 1800) + 600, // Random duration between 10 and 40 minutes
        transcriptionRequested: true,
        summarizationRequested: true
      } 
    });
  },
  
  getRecordingStatus: (sessionId: string) => {
    return Promise.resolve({ 
      data: { 
        sessionId,
        status: "recording",
        duration: Math.floor(Math.random() * 300), // Random duration up to 5 minutes
        audioLevel: Math.random() * 100 // Random audio level
      } 
    });
  },
  
  uploadAudio: (file: File, title: string, description?: string) => {
    const sessionId = uuidv4();
    return Promise.resolve({
      data: {
        sessionId,
        title,
        description,
        fileName: file.name,
        fileSize: file.size,
        status: "processing",
        uploadedAt: new Date().toISOString()
      }
    });
  }
};

export const mockSessionApi = {
  getSessions: () => Promise.resolve({ data: mockSessions }),
  
  getSessionById: (sessionId: string) => {
    const session = mockSessions.find(s => s.id === sessionId);
    if (session) {
      return Promise.resolve({ data: session });
    }
    return Promise.reject({ message: "Session not found", statusCode: 404 });
  },
  
  updateSession: (sessionId: string, title?: string, description?: string) => {
    const session = mockSessions.find(s => s.id === sessionId);
    if (session) {
      const updatedSession = { 
        ...session,
        title: title || session.title,
        description: description || session.description
      };
      return Promise.resolve({ data: updatedSession });
    }
    return Promise.reject({ message: "Session not found", statusCode: 404 });
  },
  
  deleteSession: (sessionId: string) => {
    return Promise.resolve({ data: { success: true, message: "Session deleted" } });
  },
  
  exportSession: (sessionId: string, format = 'json') => {
    return Promise.resolve({ 
      data: { 
        downloadUrl: `/mock/exports/session-${sessionId}.${format}`,
        format,
        exportedAt: new Date().toISOString()
      } 
    });
  }
};

export const mockTranscriptionApi = {
  getTranscriptions: (sessionId: string) => {
    const transcriptions = mockTranscriptions[sessionId as keyof typeof mockTranscriptions];
    if (transcriptions) {
      return Promise.resolve({ data: transcriptions });
    }
    return Promise.resolve({ data: [] });
  },
  
  startTranscription: (sessionId: string, model = 'whisper-small', language = 'en') => {
    return Promise.resolve({ 
      data: { 
        sessionId, 
        status: "transcribing",
        model,
        language,
        startedAt: new Date().toISOString()
      } 
    });
  },
  
  stopTranscription: (sessionId: string) => {
    return Promise.resolve({ 
      data: { 
        sessionId, 
        status: "completed",
        completedAt: new Date().toISOString()
      } 
    });
  },
  
  getTranscriptionStatus: (sessionId: string) => {
    return Promise.resolve({ 
      data: { 
        sessionId, 
        status: "transcribing",
        progress: Math.floor(Math.random() * 100), // Random progress
        currentPosition: Math.floor(Math.random() * 1800) // Random position in seconds
      } 
    });
  },
  
  processAudio: (sessionId: string, model = 'whisper-small', language = 'en') => {
    return Promise.resolve({ 
      data: { 
        sessionId, 
        status: "processing",
        model,
        language,
        startedAt: new Date().toISOString()
      } 
    });
  }
};

export const mockSummarizationApi = {
  getSummaries: (sessionId: string, summaryType?: string) => {
    const summaries = mockSummaries[sessionId as keyof typeof mockSummaries];
    if (summaries) {
      if (summaryType && summaryType in summaries) {
        return Promise.resolve({ 
          data: { [summaryType]: summaries[summaryType as keyof typeof summaries] } 
        });
      }
      return Promise.resolve({ data: summaries });
    }
    return Promise.resolve({ data: {} });
  },
  
  generateSummary: (sessionId: string, summaryType = 'overall') => {
    return Promise.resolve({ 
      data: { 
        sessionId, 
        summaryType,
        status: "completed",
        summary: "This is a mock generated summary for testing purposes. It simulates what would be generated by the AI model in the actual application.",
        generatedAt: new Date().toISOString()
      } 
    });
  },
  
  startRealtimeSummarization: (sessionId: string, summaryType = 'incremental') => {
    return Promise.resolve({ 
      data: { 
        sessionId, 
        summaryType,
        status: "running",
        startedAt: new Date().toISOString()
      } 
    });
  },
  
  stopRealtimeSummarization: (sessionId: string) => {
    return Promise.resolve({ 
      data: { 
        sessionId, 
        status: "stopped",
        stoppedAt: new Date().toISOString()
      } 
    });
  },
  
  getSummarizationStatus: (sessionId: string) => {
    return Promise.resolve({ 
      data: { 
        sessionId, 
        status: "running",
        lastUpdateAt: new Date(Date.now() - 60000).toISOString(),
        currentInterval: Math.floor(Math.random() * 5) + 1
      } 
    });
  }
};

// Export all mock APIs as a single object
export default {
  audio: mockAudioApi,
  session: mockSessionApi,
  transcription: mockTranscriptionApi,
  summarization: mockSummarizationApi
};
