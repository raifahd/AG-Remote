import { spawn, ChildProcess } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

export interface TerminalRunnerOptions {
  enabled?: boolean | undefined;
  allowlist?: string[] | undefined;
  defaultCwd?: string | undefined;
  maxOutputBytes?: number | undefined;
  timeoutMs?: number | undefined;
}

export interface ExecResult {
  sessionId: string;
  output: string;
  exitCode: number | null;
  cwd: string;
}

export class TerminalRunner extends EventEmitter {
  private enabled: boolean;
  private allowlist: Set<string>;
  private sessionCwds: Map<string, string> = new Map();
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private readonly defaultCwd: string;
  private readonly maxOutputBytes: number;
  private readonly timeoutMs: number;

  constructor(options: TerminalRunnerOptions = {}) {
    super();
    this.enabled = options.enabled ?? true;
    const defaultList = [
      'git',
      'npm',
      'pnpm',
      'node',
      'python',
      'python3',
      'ls',
      'cat',
      'pwd',
      'echo',
      'which',
      'find',
      'grep',
      'cargo',
      'go',
      'docker'
    ];
    this.allowlist = new Set((options.allowlist && options.allowlist.length > 0 ? options.allowlist : defaultList).map((cmd) => cmd.toLowerCase()));
    this.defaultCwd = options.defaultCwd || process.cwd();
    this.maxOutputBytes = options.maxOutputBytes || 1024 * 1024; // 1 MB limit
    this.timeoutMs = options.timeoutMs || 30000; // 30s timeout
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(val: boolean): void {
    this.enabled = val;
  }

  getAllowlist(): string[] {
    return Array.from(this.allowlist);
  }

  setAllowlist(list: string[]): void {
    this.allowlist = new Set(list.map((c) => c.toLowerCase()));
  }

  getCwd(sessionId = 'default'): string {
    return this.sessionCwds.get(sessionId) || this.defaultCwd;
  }

  setCwd(sessionId: string, newPath: string): void {
    const resolved = path.resolve(this.getCwd(sessionId), newPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Directory does not exist: ${newPath}`);
    }
    this.sessionCwds.set(sessionId, resolved);
  }

  private hasShellInjection(text: string): boolean {
    const dangerousPatterns = [
      /;\s*$/,
      /;\s+/,
      /&&/,
      /\|\|/,
      /\|/,
      />/,
      /</,
      /`/,
      /\$\(/,
      /\$\{/
    ];
    return dangerousPatterns.some((p) => p.test(text));
  }

  async execute(
    command: string,
    argv: string[] = [],
    sessionId = 'default',
    customCwd?: string
  ): Promise<ExecResult> {
    if (!this.enabled) {
      const err = new Error('Terminal module is disabled');
      (err as any).code = 'TERMINAL_DISABLED';
      throw err;
    }

    const trimmedCmd = command.trim();
    if (!trimmedCmd) {
      throw new Error('Command cannot be empty');
    }

    let binary = trimmedCmd;
    let args = argv;

    if (args.length === 0 && trimmedCmd.includes(' ')) {
      const parts = trimmedCmd.split(/\s+/);
      binary = parts[0] || '';
      args = parts.slice(1);
    }

    if (this.hasShellInjection(binary) || args.some((arg) => this.hasShellInjection(arg))) {
      const err = new Error('Shell metacharacters are rejected for security');
      (err as any).code = 'TERMINAL_SHELL_INJECTION';
      throw err;
    }

    const binaryBase = path.basename(binary).replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();

    const effectiveCwd = customCwd ? path.resolve(this.getCwd(sessionId), customCwd) : this.getCwd(sessionId);

    if (binaryBase === 'cd') {
      const targetDir = args[0] ? path.resolve(effectiveCwd, args[0]) : os.homedir();
      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        const out = `cd: no such file or directory: ${args[0] || ''}\n`;
        this.emit('output', { sessionId, chunk: out, done: true, exitCode: 1, at: Date.now() });
        return { sessionId, output: out, exitCode: 1, cwd: effectiveCwd };
      }
      this.sessionCwds.set(sessionId, targetDir);
      const out = `${targetDir}\n`;
      this.emit('output', { sessionId, chunk: out, done: true, exitCode: 0, at: Date.now() });
      return { sessionId, output: out, exitCode: 0, cwd: targetDir };
    }

    if (!this.allowlist.has(binaryBase)) {
      const err = new Error(`Command '${binaryBase}' is not in the allowed terminal list`);
      (err as any).code = 'TERMINAL_DISALLOWED';
      throw err;
    }

    if (this.activeProcesses.has(sessionId)) {
      this.kill(sessionId);
    }

    const cleanEnv: NodeJS.ProcessEnv = {
      HOME: process.env.HOME || os.homedir(),
      PATH: process.env.PATH || '',
      USER: process.env.USER || process.env.USERNAME || 'user',
      LANG: process.env.LANG || 'en_US.UTF-8',
      SHELL: process.env.SHELL || (os.platform() === 'win32' ? 'cmd.exe' : '/bin/sh'),
      TERM: 'xterm-256color'
    };

    return new Promise<ExecResult>((resolve, reject) => {
      let totalOutput = '';
      let totalBytes = 0;
      let killed = false;

      let child: ChildProcess;
      try {
        child = spawn(binary, args, {
          cwd: effectiveCwd,
          env: cleanEnv,
          shell: false
        });
      } catch (spawnErr) {
        return reject(spawnErr);
      }

      this.activeProcesses.set(sessionId, child);

      const timeoutTimer = setTimeout(() => {
        if (!killed && child.exitCode === null) {
          killed = true;
          const msg = '\n[Process terminated: timed out after 30 seconds]\n';
          totalOutput += msg;
          this.emit('output', { sessionId, chunk: msg, done: false, at: Date.now() });
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null) {
              child.kill('SIGKILL');
            }
          }, 1500);
        }
      }, this.timeoutMs);

      const handleChunk = (chunk: Buffer | string) => {
        const text = chunk.toString();
        totalBytes += Buffer.byteLength(text, 'utf8');

        if (totalBytes > this.maxOutputBytes && !killed) {
          killed = true;
          const truncationNotice = '\n[Output truncated: exceeded 1 MB limit]\n';
          totalOutput += truncationNotice;
          this.emit('output', { sessionId, chunk: truncationNotice, done: false, at: Date.now() });
          child.kill('SIGTERM');
          return;
        }

        if (totalBytes <= this.maxOutputBytes) {
          totalOutput += text;
          this.emit('output', { sessionId, chunk: text, done: false, at: Date.now() });
        }
      };

      if (child.stdout) {
        child.stdout.on('data', handleChunk);
      }
      if (child.stderr) {
        child.stderr.on('data', handleChunk);
      }

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        this.activeProcesses.delete(sessionId);
        this.emit('output', { sessionId, chunk: `\nError: ${err.message}\n`, done: true, exitCode: 1, at: Date.now() });
        reject(err);
      });

      child.on('close', (code) => {
        clearTimeout(timeoutTimer);
        this.activeProcesses.delete(sessionId);
        this.emit('output', { sessionId, chunk: '', done: true, exitCode: code, at: Date.now() });
        resolve({
          sessionId,
          output: totalOutput,
          exitCode: code,
          cwd: effectiveCwd
        });
      });
    });
  }

  kill(sessionId = 'default'): boolean {
    const child = this.activeProcesses.get(sessionId);
    if (!child) {
      return false;
    }
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 1000);
    this.activeProcesses.delete(sessionId);
    this.emit('output', { sessionId, chunk: '\n[Process killed by user]\n', done: true, exitCode: 130, at: Date.now() });
    return true;
  }
}
