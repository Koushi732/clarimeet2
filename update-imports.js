const fs = require('fs');
const path = require('path');

// Files to update
const filesToUpdate = [
  'src/pages/UploadPage.tsx',
  'src/pages/LivePage.tsx',
  'src/pages/MiniTabPage.tsx',
  'src/pages/EnhancedMiniTabPage.tsx',
  'src/components/SystemHealthMonitor.tsx',
  'src/components/floating/EnhancedMiniTab.tsx',
  'src/components/floating/ElectronMiniTab.tsx',
  'src/components/floating/FloatingChatbotPanel.tsx',
  'src/components/floating/FloatingSummaryPanel.tsx',
  'src/components/floating/FloatingTranscriptionPanel.tsx',
  'src/components/floating/StatusPanel.tsx',
  'src/components/floating/SimpleFloatingPanel.tsx',
  'src/components/floating/MiniTabNew.tsx',
  'src/components/floating/MiniTabManager.tsx',
  'src/components/floating/MiniTab.tsx',
  'src/components/floating/ImprovedMiniTab.tsx',
];

// Base directory
const baseDir = path.resolve(__dirname, 'frontend');

// Process each file
filesToUpdate.forEach(filePath => {
  const fullPath = path.join(baseDir, filePath);
  
  // Check if file exists
  if (fs.existsSync(fullPath)) {
    console.log(`Processing file: ${filePath}`);
    
    // Read file content
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace imports
    content = content.replace(
      /import\s+\{\s*(.*?)\s*\}\s+from\s+['"](.*)\/AudioContext['"];/g,
      'import { $1 } from \'$2/SimpleAudioContext\';'
    );
    
    // Write updated content back
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  } else {
    console.error(`File not found: ${filePath}`);
  }
});

console.log('Import updates completed!');
