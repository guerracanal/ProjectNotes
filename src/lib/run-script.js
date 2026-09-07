import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { APP_ROOT } from '@/lib/paths';

/**
 * Locate the Python interpreter to run the helper scripts with.
 * Prefers the project virtualenv, then PYTHON_BIN, then the system python3.
 */
export function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;

  const candidates = [
    path.join(APP_ROOT, 'venv', 'bin', 'python3'),
    path.join(APP_ROOT, 'venv', 'Scripts', 'python.exe'),
    path.join(APP_ROOT, '.venv', 'bin', 'python3'),
    path.join(APP_ROOT, '.venv', 'Scripts', 'python.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'python3';
}

/**
 * Run a Python script with arguments.
 *
 * Uses `execFile` rather than `exec`: arguments are passed to the process
 * directly instead of being interpolated into a shell command line, so a file
 * name containing quotes, `;`, or `$(...)` cannot become executable shell.
 */
export function runPythonScript(scriptPath, args = [], { timeout = 60 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      resolvePython(),
      [scriptPath, ...args],
      { timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}
