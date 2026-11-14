import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface MobileVersionState {
  version: string;
  buildId: string;
  apkAvailable: boolean;
  apkPath: string | null;
}

export function findMobileDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), 'apps/mobile'),
    path.resolve(__dirname, '../../apps/mobile'),
    path.resolve(__dirname, '../../../apps/mobile')
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) {
      return c;
    }
  }
  return null;
}

export function findApkPath(mobileDir: string | null): string | null {
  if (!mobileDir) return null;
  const candidates = [
    path.join(mobileDir, 'build/ag-remote.apk'),
    path.join(mobileDir, 'dist/ag-remote.apk'),
    path.join(mobileDir, 'android/app/build/outputs/apk/release/app-release.apk'),
    path.join(mobileDir, 'android/app/build/outputs/apk/debug/app-debug.apk'),
    path.resolve(process.cwd(), 'dist/ag-remote.apk'),
    path.resolve(process.cwd(), 'ag-remote.apk')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

export function getMobileVersionState(): MobileVersionState {
  const mobileDir = findMobileDir();
  const apkPath = findApkPath(mobileDir);
  const apkAvailable = Boolean(apkPath && fs.existsSync(apkPath));

  if (!mobileDir) {
    return {
      version: '0.1.0',
      buildId: 'initial',
      apkAvailable,
      apkPath
    };
  }

  let version = '0.1.0';
  const pkgPath = path.join(mobileDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
      if (parsed.version) {
        version = parsed.version;
      }
    } catch {}
  }

  const hash = crypto.createHash('sha256');
  hash.update(version);

  const scanDirs = [path.join(mobileDir, 'app'), path.join(mobileDir, 'src')];
  for (const dir of scanDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir, { recursive: true }) as string[];
        for (const file of files) {
          const fullPath = path.join(dir, file);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isFile() && !file.includes('node_modules')) {
              hash.update(file);
              hash.update(String(stat.mtimeMs));
              hash.update(String(stat.size));
            }
          } catch {}
        }
      } catch {}
    }
  }

  const buildId = hash.digest('hex').slice(0, 8);
  return {
    version,
    buildId,
    apkAvailable,
    apkPath
  };
}

