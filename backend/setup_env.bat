@echo off
echo ===================================================
echo          SETTING UP CLARIMEET API KEYS          
echo ===================================================
echo.

echo Creating .env file with your API keys...

(
echo # Clarimeet API Keys - CONFIGURED %date% %time%
echo.
echo # OpenAI API
echo OPENAI_API_KEY=your-openai-api-key-here
echo.
echo # Hugging Face API
echo HUGGINGFACE_API_KEY=your-huggingface-api-key-here
echo.
echo # Cohere API
echo COHERE_API_KEY=your-cohere-api-key-here
echo.
echo # TextRazor API
echo TEXTRAZOR_API_KEY=your-textrazor-api-key-here
echo.
echo # Additional free-tier API options
echo.
echo # AssemblyAI (free trial credits)
echo # ASSEMBLYAI_API_KEY=your-assemblyai-key-here
echo.
echo # Deepgram (free tier with 200hrs/month)
echo # DEEPGRAM_API_KEY=your-deepgram-key-here
echo.
echo # Config Settings
echo # Token-free options (default)
echo DEFAULT_TRANSCRIPTION_PROVIDER=local
echo DEFAULT_SUMMARIZATION_PROVIDER=public-huggingface
echo DEFAULT_CHATBOT_PROVIDER=rule
echo DEFAULT_KEYWORD_PROVIDER=smmry
echo 
echo # Token-based options (commented out)
echo # DEFAULT_TRANSCRIPTION_PROVIDER=openai
echo # DEFAULT_SUMMARIZATION_PROVIDER=huggingface
echo # DEFAULT_CHATBOT_PROVIDER=openai
echo # DEFAULT_KEYWORD_PROVIDER=textrazor
echo USE_CLOUD_STORAGE=false
) > .env

echo .env file created successfully with your API keys.
echo.
echo You can now start the cloud backend with:
echo start-cloud-backend.bat
echo.
echo Press any key to continue...
pause > nul
