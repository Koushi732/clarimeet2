@echo off
echo Starting Clarimeet Frontend Only (Mock Mode)...
echo.
echo This will start the frontend with mock data - no backend required.
echo.

REM Start the React development server
echo Starting React development server...
start cmd /k "npm start"

REM Wait for React to start
echo Waiting for React server to start...
timeout /t 10

REM Start Electron
echo Starting Electron...
call electron .
