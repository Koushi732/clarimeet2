@echo off
echo Starting Clarimeet Application...
echo.
echo This script will start both the backend and frontend.
echo.

REM Check if Python is installed
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Python is not installed or not in PATH. Please install Python first.
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js is not installed or not in PATH. Please install Node.js first.
    exit /b 1
)

echo Starting backend server...
start cmd /k "cd backend && python -m app.main"

echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo Starting frontend application...
start cmd /k "cd frontend && npm start"

echo.
echo Clarimeet is starting up! The frontend should open automatically in your browser.
echo.
echo Press any key to exit this window (the applications will continue running)...
pause >nul
