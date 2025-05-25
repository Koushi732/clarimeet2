const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// Config
const IS_WINDOWS = process.platform === 'win32';
const PYTHON_CMD = IS_WINDOWS ? 'python' : 'python3';
const BACKEND_PATH = path.join(__dirname, '..', 'backend');

// Colors for console output
const colors = {
  backend: '\x1b[36m', // Cyan
  frontend: '\x1b[32m', // Green
  error: '\x1b[31m',   // Red
  reset: '\x1b[0m'     // Reset
};

console.log(`${colors.frontend}Starting Clariimeet Integrated Application...${colors.reset}`);

// Start Backend Process
console.log(`${colors.backend}[Backend] Starting FastAPI server...${colors.reset}`);
const backendProcess = spawn(
  PYTHON_CMD, 
  ['-m', 'uvicorn', 'run_server:app', '--host', '0.0.0.0', '--port', '8000', '--reload'], 
  { cwd: BACKEND_PATH }
);

// Create readable streams for stdout and stderr
const backendStdout = readline.createInterface({ input: backendProcess.stdout });
const backendStderr = readline.createInterface({ input: backendProcess.stderr });

// Handle backend output
backendStdout.on('line', (line) => {
  console.log(`${colors.backend}[Backend] ${line}${colors.reset}`);
  
  // When backend is ready, start the frontend
  if (line.includes('Application startup complete')) {
    startFrontend();
  }
});

backendStderr.on('line', (line) => {
  console.log(`${colors.error}[Backend Error] ${line}${colors.reset}`);
});

// Start Frontend (Electron) Process
function startFrontend() {
  console.log(`${colors.frontend}[Frontend] Starting Electron app...${colors.reset}`);
  
  // Use npm run electron:dev to start the Electron app
  const frontendProcess = spawn(IS_WINDOWS ? 'npm.cmd' : 'npm', ['run', 'electron:dev'], {
    cwd: __dirname,
    shell: true
  });
  
  // Create readable streams for stdout and stderr
  const frontendStdout = readline.createInterface({ input: frontendProcess.stdout });
  const frontendStderr = readline.createInterface({ input: frontendProcess.stderr });
  
  // Handle frontend output
  frontendStdout.on('line', (line) => {
    console.log(`${colors.frontend}[Frontend] ${line}${colors.reset}`);
  });
  
  frontendStderr.on('line', (line) => {
    console.log(`${colors.error}[Frontend Error] ${line}${colors.reset}`);
  });
  
  // Handle process exit
  frontendProcess.on('exit', (code) => {
    console.log(`${colors.frontend}[Frontend] Electron app exited with code ${code}${colors.reset}`);
    backendProcess.kill();
    process.exit(code);
  });
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\nShutting down Clariimeet...');
  backendProcess.kill();
  process.exit(0);
});
