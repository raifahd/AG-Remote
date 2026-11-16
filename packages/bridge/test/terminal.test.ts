import { describe, it, expect, beforeEach } from 'vitest';
import { TerminalRunner } from '../src/terminal/terminal-runner.js';
import path from 'path';
import os from 'os';

describe('TerminalRunner', () => {
  let runner: TerminalRunner;

  beforeEach(() => {
    runner = new TerminalRunner({
      enabled: true,
      allowlist: ['node', 'git', 'ls', 'echo', 'cat', 'pwd'],
      defaultCwd: process.cwd()
    });
  });

  it('reports enabled and default allowlist correctly', () => {
    expect(runner.isEnabled()).toBe(true);
    expect(runner.getAllowlist()).toContain('node');
    expect(runner.getAllowlist()).toContain('echo');
  });

  it('rejects disallowed commands with TERMINAL_DISALLOWED', async () => {
    await expect(runner.execute('rm -rf /')).rejects.toMatchObject({
      code: 'TERMINAL_DISALLOWED'
    });
  });

  it('rejects commands when terminal is disabled', async () => {
    runner.setEnabled(false);
    await expect(runner.execute('echo hello')).rejects.toMatchObject({
      code: 'TERMINAL_DISABLED'
    });
  });

  it('rejects dangerous shell injection metacharacters with TERMINAL_SHELL_INJECTION', async () => {
    await expect(runner.execute('echo hello; ls')).rejects.toMatchObject({
      code: 'TERMINAL_SHELL_INJECTION'
    });
    await expect(runner.execute('echo hello && ls')).rejects.toMatchObject({
      code: 'TERMINAL_SHELL_INJECTION'
    });
    await expect(runner.execute('echo hello | cat')).rejects.toMatchObject({
      code: 'TERMINAL_SHELL_INJECTION'
    });
    await expect(runner.execute('echo hello > /tmp/out')).rejects.toMatchObject({
      code: 'TERMINAL_SHELL_INJECTION'
    });
    await expect(runner.execute('echo `whoami`')).rejects.toMatchObject({
      code: 'TERMINAL_SHELL_INJECTION'
    });
    await expect(runner.execute('echo $(whoami)')).rejects.toMatchObject({
      code: 'TERMINAL_SHELL_INJECTION'
    });
  });

  it('handles cd command updating working directory', async () => {
    const home = os.homedir();
    const result = await runner.execute('cd', [home], 'test-session');
    expect(result.exitCode).toBe(0);
    expect(runner.getCwd('test-session')).toBe(home);
  });

  it('executes allowed binary and captures output', async () => {
    const result = await runner.execute('node', ['-e', 'console.log("HELLO_TERMINAL")']);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('HELLO_TERMINAL');
  });

  it('streams output chunks through event listener', async () => {
    const chunks: string[] = [];
    runner.on('output', (data) => {
      if (data.chunk) {
        chunks.push(data.chunk);
      }
    });

    await runner.execute('node', ['-e', 'console.log("CHUNK_ONE"); console.log("CHUNK_TWO");']);
    const fullText = chunks.join('');
    expect(fullText).toContain('CHUNK_ONE');
    expect(fullText).toContain('CHUNK_TWO');
  });

  it('allows killing an active process', () => {
    const killed = runner.kill('non-existent-session');
    expect(killed).toBe(false);
  });
});
