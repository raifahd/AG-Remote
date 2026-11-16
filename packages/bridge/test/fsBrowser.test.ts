import { describe, it, expect, beforeEach } from 'vitest';
import { FsBrowser } from '../src/fs/fs-browser.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('FsBrowser', () => {
  let browser: FsBrowser;
  const testRoot = path.join(process.cwd());

  beforeEach(() => {
    browser = new FsBrowser({
      enabled: true,
      rootPath: testRoot,
      defaultWorkspace: testRoot
    });
  });

  it('initializes with enabled state and configured root', () => {
    expect(browser.isEnabled()).toBe(true);
    expect(browser.getRootPath()).toBe(testRoot);
  });

  it('returns roots including home and workspace', () => {
    const rootsResp = browser.getRoots();
    expect(rootsResp.roots.length).toBeGreaterThanOrEqual(1);
    expect(rootsResp.currentRoot).toBe(testRoot);
  });

  it('lists directory entries sorted with directories first', async () => {
    const listing = await browser.listDirectory(testRoot);
    expect(listing.path).toBe(testRoot);
    expect(Array.isArray(listing.items)).toBe(true);

    let seenFile = false;
    for (const item of listing.items) {
      if (!item.isDirectory) {
        seenFile = true;
      }
      if (seenFile && item.isDirectory) {
        expect('Directory appeared after file').toBe('Directories should be first');
      }
    }
  });

  it('rejects path traversal outside root with FS_ACCESS_DENIED', async () => {
    await expect(browser.listDirectory('/etc')).rejects.toMatchObject({
      code: 'FS_ACCESS_DENIED'
    });
    await expect(browser.listDirectory(path.join(testRoot, '../../../../etc'))).rejects.toMatchObject({
      code: 'FS_ACCESS_DENIED'
    });
  });

  it('reads preview of a text file with language inference', async () => {
    const pkgPath = path.join(testRoot, 'package.json');
    const preview = await browser.readFilePreview(pkgPath);
    expect(preview.name).toBe('package.json');
    expect(preview.isBinary).toBe(false);
    expect(preview.language).toBe('json');
    expect(preview.content).toContain('name');
  });

  it('detects binary file preview correctly', async () => {
    const tmpBinary = path.join(testRoot, '.ag-remote', 'test-binary.bin');
    fs.mkdirSync(path.dirname(tmpBinary), { recursive: true });
    fs.writeFileSync(tmpBinary, Buffer.from([0x00, 0x01, 0x02, 0x03]));

    try {
      const preview = await browser.readFilePreview(tmpBinary);
      expect(preview.isBinary).toBe(true);
      expect(preview.content).toBe('');
    } finally {
      if (fs.existsSync(tmpBinary)) {
        fs.unlinkSync(tmpBinary);
      }
    }
  });

  it('executes openFolder callback and emits event', async () => {
    let openedFolder = '';
    const customBrowser = new FsBrowser({
      enabled: true,
      rootPath: testRoot,
      defaultWorkspace: testRoot,
      openFolderCallback: async (p) => {
        openedFolder = p;
      }
    });

    let eventEmitted = false;
    customBrowser.on('folder_opened', (evt) => {
      if (evt.path === testRoot) {
        eventEmitted = true;
      }
    });

    const res = await customBrowser.openFolder(testRoot);
    expect(res.ok).toBe(true);
    expect(openedFolder).toBe(testRoot);
    expect(eventEmitted).toBe(true);
  });
});
