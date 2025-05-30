const fs = require('fs');
const path = require('path');

// Define source and destination paths
const sourcePath = path.join(__dirname, 'frontend', 'src', 'contexts', 'FixedAudioContext.tsx');
const destPath = path.join(__dirname, 'frontend', 'src', 'contexts', 'AudioContext.tsx');

// Create a backup of the original file
const backupPath = path.join(__dirname, 'frontend', 'src', 'contexts', 'AudioContext.tsx.bak');
if (fs.existsSync(destPath)) {
  console.log('Creating backup of original file...');
  fs.copyFileSync(destPath, backupPath);
  console.log(`Backup created at: ${backupPath}`);
}

// Copy the fixed file to replace the original
console.log(`Copying fixed file from ${sourcePath} to ${destPath}...`);
fs.copyFileSync(sourcePath, destPath);
console.log('File copied successfully!');
