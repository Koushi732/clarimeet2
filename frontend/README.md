# Clarimeet

A professional Electron-based desktop application for AI-powered meeting transcription, summarization, and note-taking.

## Features

- **Real-time Audio Transcription**: Capture and transcribe meetings in real-time
- **AI-Powered Summaries**: Generate intelligent summaries of your meetings
- **Floating MiniTab**: Quick access to summaries, AI chat, and notes
- **Session Management**: Organize and review past meetings
- **Export Options**: Export transcripts and summaries as Markdown or PDF
- **Dark/Light Theme**: Choose your preferred visual style
- **System Health Monitoring**: Monitor application performance and status

## Getting Started

### Prerequisites

- Node.js 14.x or higher
- npm 6.x or higher

### Installation

1. Clone the repository
```
git clone https://github.com/yourusername/clarimeet.git
cd clarimeet/frontend
```

2. Install dependencies
```
npm install
```

### Development

#### Run React frontend only
```
npm start
```

#### Run Electron with React frontend
```
npm run electron:dev
```

### Building for Production

#### Build React frontend
```
npm run build
```

#### Package as Electron app
```
npm run electron:build
```

This will create executable files in the `dist` directory.

## Application Structure

- `src/components` - UI components
- `src/contexts` - React contexts for state management
- `src/hooks` - Custom React hooks
- `src/pages` - Main application pages
- `src/services` - API and service integrations
- `src/types` - TypeScript type definitions
- `src/utils` - Utility functions

## Key Components

### Pages
- **Home**: Dashboard with session listings
- **Live**: Real-time recording and transcription
- **Summary**: View and export transcripts and summaries
- **Upload**: Upload existing audio files
- **Settings**: Configure application preferences

### Floating Components
- **MiniTab**: Compact floating panel with summary, chat, and notes
- **Status Panel**: System health and status monitoring

## Using the Application

### Recording a Meeting
1. Navigate to the Live page
2. Select your audio input device
3. Enter a title (optional)
4. Click "Start Recording"
5. Use the MiniTab to view live summaries and take notes
6. Click "Stop Recording" when finished

### Viewing Summaries
1. Navigate to the Summary page
2. Select the session you want to view
3. View different summary types (overall, key points, action items)
4. Export to Markdown or PDF as needed

### Using AI Chat
1. Open the MiniTab during or after a session
2. Switch to the AI Chat tab
3. Ask questions about your meeting content

## Keyboard Shortcuts
- `Ctrl+R`: Start/Stop recording
- `Ctrl+M`: Toggle MiniTab
- `Ctrl+P`: Toggle Status Panel

## Configuration
Application settings can be configured in the Settings page, including:
- Audio device preferences
- Transcription settings
- UI preferences
- Export options

## License
[MIT License](LICENSE)
