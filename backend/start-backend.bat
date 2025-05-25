@echo off
echo Starting Clariimeet Backend...
set PYTHONUNBUFFERED=1

:: Activate virtual environment if it exists
if exist ".\venv\Scripts\activate.bat" (
    call .\venv\Scripts\activate.bat
)

:: Start the FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

pause
