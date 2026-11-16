import { execFile } from 'child_process';

export interface LsServer {
  pid: number;
  workspaceId: string | null;
  token: string;
  ports: number[];
  ppid?: number | undefined;
  kind?: 'language_server' | 'agy' | undefined;
  attached?: boolean | undefined;
  addDirs?: string[] | undefined;
  appDataDir?: string | undefined;
}

export interface ParsedServer {
  kind: 'language_server' | 'agy';
  token: string;
  workspaceId: string | null;
  attached: boolean;
  addDirs: string[];
  appDataDir?: string | undefined;
}

export type Discover = () => Promise<LsServer[]>;

export function normalizeWorkspace(uriOrPath: string): string {
  let p = String(uriOrPath || '');
  if (p.startsWith('file://')) {
    p = p.slice('file://'.length);
    try {
      p = decodeURIComponent(p);
    } catch {}
    if (/^\/[a-zA-Z]:/.test(p)) {
      p = p.slice(1);
    }
  }
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function flagValues(cmd: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`(?:^|\\s)--${name}(?:=([\\S]+)|\\s+([\\S]+))`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd)) !== null) {
    const val = m[1] || m[2];
    if (val) {
      out.push(val.replace(/^"|"$/g, ''));
    }
  }
  return out;
}

export function parseServerCommandLine(cmd: string): ParsedServer | null {
  const exe = cmd.split(/\s--/)[0]?.trim().replace(/^"|"$/g, '') || '';
  const base = (exe.split(/[\\/]/).pop() || '').toLowerCase().replace(/\.exe$/, '');
  const kind = base.startsWith('language_server') ? 'language_server' : base === 'agy' ? 'agy' : null;
  if (!kind) {
    return null;
  }

  const token = flagValues(cmd, 'csrf_token')[0] || flagValues(cmd, 'token')[0] || '';
  if (!token) {
    return null;
  }

  return {
    kind,
    token,
    workspaceId: flagValues(cmd, 'workspace_id')[0] || null,
    attached: /(?:^|\s)--parent_pipe_path[= ]/.test(cmd),
    addDirs: flagValues(cmd, 'add-dir').map(normalizeWorkspace),
    appDataDir: flagValues(cmd, 'app_data_dir')[0]
  };
}

export function parsePsOutput(raw: string): Array<ParsedServer & { pid: number; ppid: number }> {
  const out: Array<ParsedServer & { pid: number; ppid: number }> = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const parsed = parseServerCommandLine(m[3] ?? '');
    if (parsed) {
      out.push({ pid: Number(m[1]), ppid: Number(m[2]), ...parsed });
    }
  }
  return out;
}

export function rankLanguageServers<T extends Pick<LsServer, 'ppid' | 'attached' | 'addDirs' | 'kind'>>(
  procs: T[],
  workspace?: string,
  ownerPid?: number
): T[] {
  const ws = workspace ? normalizeWorkspace(workspace) : '';
  const own = (p: T) => !!ownerPid && p.kind === 'agy' && p.ppid === ownerPid;
  const score = (p: T) =>
    (ws && p.addDirs?.includes(ws) ? 4 : 0) +
    (own(p) ? 3 : 0) +
    (p.attached ? 2 : 0) +
    (p.ppid === 1 ? -1 : 0);

  return procs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => score(b.p) - score(a.p) || a.i - b.i)
    .map((x) => x.p);
}

export function parseWindowsNetstatPorts(netstat: string, pid: number): number[] {
  const pidStr = String(pid);
  return netstat
    .split(/\r?\n/)
    .filter((l) => /LISTENING/.test(l) && /127\.0\.0\.1:/.test(l) && l.trim().split(/\s+/).pop() === pidStr)
    .map((l) => Number((/127\.0\.0\.1:(\d+)/.exec(l) || [])[1]))
    .filter(Boolean);
}

export function parseListeningPorts(raw: string): Map<number, number[]> {
  const ports = new Map<number, number[]>();
  const add = (pid: number, port: number) => {
    const list = ports.get(pid) || [];
    if (!list.includes(port)) {
      list.push(port);
    }
    ports.set(pid, list);
  };

  for (const line of raw.split(/\r?\n/)) {
    const lsof = /^\S+\s+(\d+)\s.*\s(?:127\.0\.0\.1|localhost|\*):(\d+)\s+\(LISTEN\)/.exec(line);
    if (lsof && lsof[1] && lsof[2]) {
      add(Number(lsof[1]), Number(lsof[2]));
      continue;
    }
    const ss = /\s(?:127\.0\.0\.1|\*|0\.0\.0\.0):(\d+)\s.*\bpid=(\d+)/.exec(line);
    if (ss && ss[1] && ss[2]) {
      add(Number(ss[2]), Number(ss[1]));
    }
  }
  return ports;
}

export const discoverWindowsLanguageServers: Discover = async () => {
  const run = (cmd: string, args: string[]) =>
    new Promise<string>((res) =>
      execFile(cmd, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (_e, out) => res(String(out || '')))
    );

  const raw = await run('powershell.exe', [
    '-NoProfile',
    '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name LIKE 'language_server%' OR Name = 'agy.exe'\" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress"
  ]);

  let procs: Array<{ ProcessId?: number; ParentProcessId?: number; CommandLine?: string }> = [];
  try {
    const j = JSON.parse(raw);
    procs = Array.isArray(j) ? j : [j];
  } catch {
    return [];
  }

  const netstat = await run('netstat.exe', ['-ano', '-p', 'TCP']);
  const servers: LsServer[] = [];

  for (const p of procs) {
    const parsed = parseServerCommandLine(String(p?.CommandLine || ''));
    if (!parsed) continue;
    const ports = parseWindowsNetstatPorts(netstat, Number(p.ProcessId));
    if (ports.length > 0) {
      servers.push({
        pid: Number(p.ProcessId),
        ppid: Number(p.ParentProcessId),
        ports,
        ...parsed
      });
    }
  }
  return servers;
};

export const discoverPosixLanguageServers: Discover = async () => {
  const run = (cmd: string, args: string[]) =>
    new Promise<string>((res) =>
      execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024 }, (_e, out) => res(String(out || '')))
    );

  const psOutput = await run('ps', ['-axww', '-o', 'pid=,ppid=,command=']);
  const procs = parsePsOutput(psOutput);
  if (procs.length === 0) return [];

  const pids = procs.map((p) => p.pid).join(',');
  let listen = await run('lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', pids]);
  if (!listen && process.platform === 'darwin') {
    listen = await run('/usr/sbin/lsof', ['-nP', '-a', '-iTCP', '-sTCP:LISTEN', '-p', pids]);
  }
  if (!listen) {
    listen = await run('ss', ['-ltnpH']);
  }

  const ports = parseListeningPorts(listen);
  return procs
    .map((p) => ({ ...p, ports: ports.get(p.pid) || [] }))
    .filter((s) => s.ports.length > 0);
};

export const discoverLanguageServers: Discover =
  process.platform === 'win32' ? discoverWindowsLanguageServers : discoverPosixLanguageServers;
