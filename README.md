# Clarimeet - AI Meeting Companion

Clarimeet is a next-generation AI-powered desktop application that can record, transcribe, and summarize live meetings and uploaded audio in real-time. The project combines an Electron-based desktop interface with powerful backend ML capabilities for a seamless meeting assistance experience.

## 🔥 Core Features

- 🎙️ **System Audio Capture** - Record from desktop audio sources including Zoom, Google Meet, and more
- ⏱️ **Real-Time Transcription & Summarization** - Live processing of audio with AI
- 📂 **Audio Upload & Processing** - Import audio files for offline transcription
- 🧠 **Session Management** - Save, organize and export meeting data
- 🪟 **Modern Floating UI** - Sleek interface with always-accessible panels
- 📊 **System Health Monitoring** - Real-time status feedback on all system components
- 📄 **Export Functionality** - Export transcripts and summaries in Markdown and PDF formats

## 🛠️ Tech Stack

- **Frontend**: React.js + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Audio Input**: WASAPI (Windows) / BlackHole (Mac) / PulseAudio (Linux)
- **Speech Recognition**: Whisper / Vosk
- **Summarization**: BART or Pegasus (HuggingFace)
- **Storage**: SQLite
- **Live Stream**: WebSocket API

## 📋 Project Structure

```
clariimeet/
├── backend/           # FastAPI Python backend
│   ├── app/           # Application code
│   ├── models/        # AI models
│   └── utils/         # Utility functions
├── frontend/          # React frontend
│   ├── public/
│   └── src/
└── docs/              # Documentation
```

## 🚀 Getting Started

### Prerequisites

- Python 3.10 (strongly recommended)
  - **Important Note**: The ML components have compatibility issues with Python 3.12+
  - If using Python 3.12+, see the Docker setup instructions below
- Node.js 16+
- npm or yarn
- For audio capture:
  - Windows: Built-in support
  - macOS: [BlackHole](https://github.com/ExistentialAudio/BlackHole) virtual audio driver
  - Linux: PulseAudio

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the backend server
uvicorn app.main:app --reload
```

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install
# or
yarn install

# Start the development server
npm start
# or
yarn start
```

## 💭 Python Version Compatibility

This project uses several ML libraries that currently have compatibility issues with Python 3.12+:

- **Recommended**: Use Python 3.10 for full functionality
- **Alternative**: Use Docker with Python 3.10 image (see below)
- **Workaround**: For Python 3.12+ users, some ML features use alternative implementations

### Docker Setup (For Python 3.12+ Users)

```bash
# Build Docker image with Python 3.10
docker build -t clariimeet-backend .

# Run the container
docker run -p 8000:8000 -d clariimeet-backend
```

## 📝 Project Status

Clarimeet is currently in active development with the following status:

- ✅ Core application structure
- ✅ WebSocket communication
- ✅ UI components and layouts
- ✅ System health monitoring
- ✅ Session management
- 🟡 Audio capture and processing (partially implemented)
- 🟡 Transcription service (integration in progress)
- 🟡 Summarization (integration in progress)

See [INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md) for more details.

## 📝 License

[MIT](LICENSE)
