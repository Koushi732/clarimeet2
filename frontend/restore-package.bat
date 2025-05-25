@echo off
echo Restoring original package.json...

if exist package.json.bak (
  copy package.json.bak package.json
  del package.json.bak
  echo Original package.json restored successfully.
) else (
  echo No backup file found. Nothing to restore.
)

pause
