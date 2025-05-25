# Clariimeet Prototype Demo

This document provides instructions for running the Clariimeet prototype demonstration.

## About Clariimeet

Clariimeet is an AI-powered meeting companion that records, transcribes, and summarizes meetings in real-time. The application has a modular architecture with separate components for WebSocket management, audio handling, session management, and UI.

## Running the Prototype

### Step 1: Start the Backend Server

1. Open a terminal/command prompt
2. Navigate to the backend directory: `cd backend`
3. Run the backend server: `python -m app.main`

The backend will start on `http://localhost:8000`

### Step 2: Start the Frontend Application

1. Open a new terminal/command prompt (keep the backend running)
2. Navigate to the frontend directory: `cd frontend`
3. Start the Electron app: `npm start`

## Demo Features

In this prototype, you can:

1. **Explore the UI**: Navigate through the application's interface
2. **View System Health**: Check connection status in the system health panel
3. **Browse Sessions**: View the session management interface
4. **Audio Device Selection**: The prototype provides simulated audio devices

## Known Limitations

This is a prototype with the following limitations:

1. **Limited ML Features**: Advanced transcription and summarization features are mocked
2. **Audio Processing**: Real-time audio processing is simulated
3. **Data Persistence**: Session data is not fully persisted between runs

## Troubleshooting

If you encounter issues:

1. Ensure both backend and frontend are running
2. Check the System Health panel for connection status
3. Restart both services if connections fail

## Next Steps

Following this prototype, development will focus on:

1. Resolving dependency compatibility issues
2. Implementing full ML-based transcription and summarization
3. Enhancing the real-time audio processing capabilities
4. Improving data persistence and session management
