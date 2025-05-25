@echo off
echo Starting Clarimeet Frontend in Mock Mode...
echo.
echo This will start the frontend with mock data - no backend required.
echo.

REM Create a backup of the original package.json
echo Creating backup of package.json...
copy package.json package.json.bak

REM Replace package.json with the mock version that has no proxy setting
echo Setting up mock configuration...
copy package.mock.json package.json

REM Start the React development server
echo Starting React development server in mock mode...
start cmd /k "npm start"

REM Wait for React to start
echo Waiting for React server to start...
timeout /t 10

REM Start Electron
echo Starting Electron...
start cmd /k "electron ."

echo.
echo When you're done testing, run restore-package.bat to restore the original package.json
echo.
