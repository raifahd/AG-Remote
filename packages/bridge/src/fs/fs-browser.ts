import os from 'os';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { FsItem, FsRoot, FsRootsResponse, FsListResponse, FsReadResponse } from '@ag-remote/shared';

export interface FsBrowserOptions {
  enabled?: boolean | undefined;
  rootPath?: string | undefined;
  defaultWorkspace?: string | undefined;
  openFolderCallback?: ((folderPath: string, newWindow?: boolean) => Promise<void>) | undefined;
}

export class FsBrowser extends EventEmitter {
  private enabled: boolean;
  private readonly rootPath: string;
  private readonly defaultWorkspace?: string | undefined;
  private readonly openFolderCallback?: ((folderPath: string, newWindow?: boolean) => Promise<void>) | undefined;

  constructor(options: FsBrowserOptions = {}) {
    super();
    this.enabled = options.enabled ?? true;
    const home = os.homedir();
    this.rootPath = path.resolve(options.rootPath ? options.rootPath.replace(/^~($|[/\\])/, `${home}$1`) : home);
    this.defaultWorkspace = options.defaultWorkspace ? path.resolve(options.defaultWorkspace) : undefined;
    this.openFolderCallback = options.openFolderCallback;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(val: boolean): void {
    this.enabled = val;
  }

  getRootPath(): string {
    return this.rootPath;
  }

  private validatePath(userPath: string): string {
    if (!this.enabled) {
      const err = new Error('File system browser is disabled');
      (err as any).code = 'FS_ACCESS_DENIED';
      throw err;
    }

    const home = os.homedir();
    const expanded = userPath.replace(/^~($|[/\\])/, `${home}$1`);
    const resolved = path.resolve(expanded);

    const normalizedRoot = path.normalize(this.rootPath).toLowerCase();
    const normalizedTarget = path.normalize(resolved).toLowerCase();

    const isInsideRoot = normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + path.sep);
    const isInsideWorkspace = this.defaultWorkspace && (
      normalizedTarget === path.normalize(this.defaultWorkspace).toLowerCase() ||
      normalizedTarget.startsWith(path.normalize(this.defaultWorkspace).toLowerCase() + path.sep)
    );

    if (!isInsideRoot && !isInsideWorkspace) {
      const err = new Error(`Access denied: path is outside configured root (${this.rootPath})`);
      (err as any).code = 'FS_ACCESS_DENIED';
      throw err;
    }

    if (fs.existsSync(resolved)) {
      try {
        const real = fs.realpathSync(resolved);
        const normalizedReal = path.normalize(real).toLowerCase();
        const realInsideRoot = normalizedReal === normalizedRoot || normalizedReal.startsWith(normalizedRoot + path.sep);
        const realInsideWorkspace = this.defaultWorkspace && (
          normalizedReal === path.normalize(this.defaultWorkspace).toLowerCase() ||
          normalizedReal.startsWith(path.normalize(this.defaultWorkspace).toLowerCase() + path.sep)
        );
        if (!realInsideRoot && !realInsideWorkspace) {
          const err = new Error('Access denied: symlink target is outside configured root');
          (err as any).code = 'FS_ACCESS_DENIED';
          throw err;
        }
      } catch (err: any) {
        if (err.code === 'FS_ACCESS_DENIED') throw err;
      }
    }

    return resolved;
  }

  getRoots(): FsRootsResponse {
    const roots: FsRoot[] = [];
    const home = os.homedir();

    roots.push({
      name: `Home (${path.basename(home)})`,
      path: home
    });

    if (this.defaultWorkspace && this.defaultWorkspace !== home) {
      roots.push({
        name: `Current Workspace (${path.basename(this.defaultWorkspace)})`,
        path: this.defaultWorkspace
      });
    }

    if (os.platform() === 'win32') {
      const drives = ['C', 'D', 'E', 'F', 'G'];
      for (const d of drives) {
        const p = `${d}:\\`;
        if (fs.existsSync(p)) {
          roots.push({ name: `Drive ${d}:`, path: p });
        }
      }
    }

    return {
      roots,
      currentRoot: this.rootPath,
      defaultWorkspace: this.defaultWorkspace
    };
  }

  async listDirectory(targetPath: string): Promise<FsListResponse> {
    const resolved = this.validatePath(targetPath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory not found: ${targetPath}`);
    }

    const stat = await fs.promises.stat(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${targetPath}`);
    }

    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    const items: FsItem[] = [];

    for (const entry of entries) {
      try {
        const fullEntryPath = path.join(resolved, entry.name);
        const isHidden = entry.name.startsWith('.');

        let isDir = entry.isDirectory();
        let size = 0;
        let mtime = 0;

        if (entry.isSymbolicLink()) {
          try {
            const entryStat = await fs.promises.stat(fullEntryPath);
            isDir = entryStat.isDirectory();
            size = entryStat.size;
            mtime = Math.floor(entryStat.mtimeMs);
          } catch {
            continue;
          }
        } else {
          try {
            const entryStat = await fs.promises.stat(fullEntryPath);
            size = entryStat.size;
            mtime = Math.floor(entryStat.mtimeMs);
          } catch {
            size = 0;
            mtime = Date.now();
          }
        }

        items.push({
          name: entry.name,
          path: fullEntryPath,
          isDirectory: isDir,
          size,
          mtime,
          isHidden
        });
      } catch {
        continue;
      }
    }

    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    const parentDir = path.dirname(resolved);
    let parent: string | null = null;
    try {
      this.validatePath(parentDir);
      parent = parentDir !== resolved ? parentDir : null;
    } catch {
      parent = null;
    }

    return {
      path: resolved,
      parent,
      items,
      isWorkspace: this.defaultWorkspace ? resolved.toLowerCase() === this.defaultWorkspace.toLowerCase() : false
    };
  }

  async readFilePreview(targetPath: string, maxBytes = 500 * 1024): Promise<FsReadResponse> {
    const resolved = this.validatePath(targetPath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${targetPath}`);
    }

    const stat = await fs.promises.stat(resolved);
    if (stat.isDirectory()) {
      throw new Error(`Cannot preview directory as file: ${targetPath}`);
    }

    const fd = await fs.promises.open(resolved, 'r');
    const headerBuffer = Buffer.alloc(Math.min(512, stat.size));
    await fd.read(headerBuffer, 0, headerBuffer.length, 0);

    let isBinary = false;
    for (let i = 0; i < headerBuffer.length; i++) {
      if (headerBuffer[i] === 0) {
        isBinary = true;
        break;
      }
    }

    const ext = path.extname(resolved).toLowerCase();
    const language = this.inferLanguage(ext);

    if (isBinary) {
      await fd.close();
      return {
        path: resolved,
        name: path.basename(resolved),
        content: '',
        size: stat.size,
        isBinary: true,
        language
      };
    }

    const bytesToRead = Math.min(stat.size, maxBytes);
    const readBuffer = Buffer.alloc(bytesToRead);
    await fd.read(readBuffer, 0, bytesToRead, 0);
    await fd.close();

    const content = readBuffer.toString('utf8');

    return {
      path: resolved,
      name: path.basename(resolved),
      content,
      size: stat.size,
      isBinary: false,
      language
    };
  }

  private inferLanguage(ext: string): string {
    const extMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.json': 'json',
      '.py': 'python',
      '.md': 'markdown',
      '.html': 'html',
      '.css': 'css',
      '.sh': 'shell',
      '.bash': 'shell',
      '.ps1': 'powershell',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.xml': 'xml',
      '.sql': 'sql',
      '.txt': 'plaintext'
    };
    return extMap[ext] || 'plaintext';
  }

  async openFolder(folderPath: string, newWindow = false): Promise<{ ok: true; opened: string; message: string }> {
    const resolved = this.validatePath(folderPath);

    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Cannot open: path is not an existing directory (${folderPath})`);
    }

    if (this.openFolderCallback) {
      await this.openFolderCallback(resolved, newWindow);
    }

    this.emit('folder_opened', {
      path: resolved,
      name: path.basename(resolved),
      newWindow,
      at: Date.now()
    });

    return {
      ok: true,
      opened: resolved,
      message: `Opened folder '${path.basename(resolved)}' in Antigravity`
    };
  }
}
