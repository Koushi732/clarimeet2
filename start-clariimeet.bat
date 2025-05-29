@echo off
echo ===================================================
echo          STARTING CLARIIMEET APPLICATION          
echo ===================================================
echo.

:: Check if .env file exists, if not create from example
if not exist ".env" (
    echo Environment file not found. Creating from .env.example...
    if exist ".env.example" (
        copy .env.example .env
        echo Created .env file. Please edit it with your API keys before continuing.
        echo Opening .env file for editing...
        notepad .env
        echo.
        echo After setting up your API keys, run this script again.
        pause
        exit
    ) else (
        echo Error: .env.example file not found.
        echo Please create a .env file with your API keys manually.
        pause
        exit
    )
)

:: Start the application
cd frontend
node start-integrated.js

pause
