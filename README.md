# Clarimeet - AI Meeting Companion

Clarimeet is a next-generation AI-powered desktop application that can record, transcribe, and summarize live meetings and uploaded audio in real-time. The project combines an Electron-based desktop interface with powerful backend ML capabilities for a seamless meeting assistance experience.

## 🔥 Core Features

- 🎙️ **System Audio Capture** - Record from desktop audio sources including Zoom, Google Meet, and more
- ⏱️ **Real-Time Transcription & Summarization** - Live processing of audio with AI
- 📂 **Audio Upload & Processing** - Import audio files for offline transcription
- 🧠 **Session Management** - Save, organize and export meeting data
- 🪟 **Modern Floating UI** - Sleek interface with always-accessible panels
- 👥 **Speaker Diarization** - Identify and separate different speakers in transcriptions
- 🌐 **Multi-language Support** - Support for 30+ languages with varying levels of capability
- 🤖 **AI Chat Assistant** - Get answers and assistance during your meeting
- 📄 **Export Functionality** - Export transcripts and summaries in various formats

## 🔬 Tech Stack

- **Frontend**: React.js + Tailwind CSS
- **Backend**: FastAPI (Python)
- **Real-time Communication**: Socket.IO
- **Audio Processing**: WebAudio API, pydub, librosa
- **Speech Recognition**: Deepgram Nova-2 (free tier)
- **Speaker Diarization**: Deepgram's speaker detection
- **Summarization**: Google Gemini (free tier)
- **Chat Assistant**: Google Gemini (free tier)
- **Storage**: SQLite

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

- Python 3.10+ (3.9+ should work for most features)
- Node.js 16+
- npm or yarn
- FFmpeg (for audio processing)

### Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/clarimeet.git
cd clarimeet
```

#### 2. Set Up Backend

```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate
pip install -r requirements.txt
```

#### 3. Set Up API Keys (Free Tiers)

Clarimeet uses free-tier AI services for transcription and summarization:

1. **Deepgram API** ($200 free credit, no expiration)
   - Sign up at: https://console.deepgram.com/signup
   - Create a new API key in your dashboard
   - No credit card required

2. **Google Gemini API** (generous free tier)
   - Get API key at: https://aistudio.google.com/app/apikey
   - No credit card required

Create a `.env` file in the `backend` directory with:

```
DEEPGRAM_API_KEY=your_deepgram_api_key_here
GOOGLE_GEMINI_API_KEY=your_gemini_api_key_here
```

#### 4. Set Up Frontend

```bash
cd frontend
npm install
```

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
- **Workaround**: For Python 3.12+ users, some ML features will use simplified implementations

### Docker Setup

```bash
# Build Docker image
docker build -t clarimeet-backend .

# Run the container with environment variables
docker run -p 8000:8000 \
  -e DEEPGRAM_API_KEY=your_deepgram_api_key_here \
  -e GEMINI_API_KEY=your_gemini_api_key_here \
  -d clarimeet-backend
```

## 📝 Project Status

Clarimeet has been fully implemented as a prototype with the following features:

- ✅ Core application structure
- ✅ Socket.IO real-time communication
- ✅ Modern responsive UI components
- ✅ Session management
- ✅ Audio processing
- ✅ Transcription service with Deepgram
- ✅ Speaker diarization
- ✅ Multi-language support (30+ languages)
- ✅ Real-time AI-powered summarization
- ✅ AI Chat Assistant
- ✅ Floating panel interface

The application is now ready for prototype demonstration and testing.

## 🔮 Future Enhancements

- Full offline mode with local models
- Expanded meeting analytics
- Additional export formats
- Authentication and user management
- Team collaboration features
- Mobile companion app

## 📝 License

[MIT](LICENSE)
