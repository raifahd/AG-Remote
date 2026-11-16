import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  HealthResponse,
  PromptRequestSchema,
  ApproveRequestSchema,
  RejectRequestSchema,
  QuietHoursSettingsSchema,
  UploadPayloadSchema,
  CreateSessionRequestSchema,
  SelectModelRequestSchema,
  SelectWindowRequestSchema,
  HubRegisterRequestSchema,
  HubHeartbeatRequestSchema,
  AgentEvent,
  ApiError
} from '@ag-remote/shared';
import { RateLimiter, TokenManager, PairingManager, constantTimeCompare } from './auth.js';
import { AgentAdapter } from './adapters/AgentAdapter.js';
import { NtfyNotifier } from './notifier.js';
import { getMobileVersionState } from './versioning.js';
import { WindowRegistry } from './core/window-registry.js';
import { MultiWindowManager } from './core/multiWindowManager.js';

export interface ServerConfig {
  port: number;
  host: string;
  version: string;
  adapterMode: 'sdk' | 'cdp' | 'fake';
  uploadDir?: string;
  workspacePath?: string;
  workspaceName?: string;
  createAdapter?: ((workspacePath: string, pid?: number | undefined) => AgentAdapter) | undefined;
}

export class BridgeServer {
  private readonly config: ServerConfig;
  private readonly uploadDir: string;
  private readonly adapter: AgentAdapter;
  private readonly tokenManager: TokenManager;
  private readonly rateLimiter: RateLimiter;
  private readonly pairingManager: PairingManager;
  private readonly windowRegistry: WindowRegistry;
  private readonly multiWindowManager: MultiWindowManager;
  private readonly notifier?: NtfyNotifier | undefined;
  private readonly app: express.Express;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly sockets = new Set<WebSocket>();
  private eventSubscription: { dispose(): void } | null = null;

  constructor(
    config: ServerConfig,
    adapter: AgentAdapter,
    tokenManager: TokenManager,
    rateLimiter = new RateLimiter(),
    notifier?: NtfyNotifier | undefined,
    pairingManager = new PairingManager(),
    multiWindowManager?: MultiWindowManager | undefined
  ) {
    this.config = config;
    this.uploadDir = config.uploadDir || path.join(process.cwd(), '.ag-remote', 'uploads');
    fs.mkdirSync(this.uploadDir, { recursive: true });
    this.adapter = adapter;
    this.tokenManager = tokenManager;
    this.rateLimiter = rateLimiter;
    this.notifier = notifier;
    this.pairingManager = pairingManager;
    const defaultHostId = config.workspacePath
      ? Buffer.from(config.workspacePath).toString('hex').slice(0, 12)
      : 'primary-window';
    this.multiWindowManager = multiWindowManager ?? new MultiWindowManager({
      hostWindowId: defaultHostId,
      hostAdapter: adapter,
      createAdapter: config.createAdapter
    });
    this.windowRegistry = this.multiWindowManager.getRegistry();

    this.windowRegistry.register({
      windowId: this.multiWindowManager.getHostWindowId(),
      workspacePath: config.workspacePath ?? process.cwd(),
      workspaceName: config.workspaceName ?? path.basename(config.workspacePath ?? process.cwd()),
      pid: process.pid
    });

    this.app = express();
    this.configureApp();
  }

  getAdapter(windowId?: string): AgentAdapter {
    return this.multiWindowManager.getAdapter(windowId);
  }

  getDefaultAdapter(): AgentAdapter {
    return this.adapter;
  }

  getWindowRegistry(): WindowRegistry {
    return this.windowRegistry;
  }

  getMultiWindowManager(): MultiWindowManager {
    return this.multiWindowManager;
  }

  private configureApp(): void {
    this.app.use(express.json({ limit: '30mb' }));

    this.app.get('/health', (_req: Request, res: Response) => {
      res.json(this.buildHealthResponse());
    });

    const handleVersionCheck = (req: Request, res: Response) => {
      const state = getMobileVersionState();
      const clientVersion = typeof req.query.clientVersion === 'string' ? req.query.clientVersion : undefined;
      const clientBuildId = typeof req.query.clientBuildId === 'string' ? req.query.clientBuildId : undefined;

      let updateRequired = false;
      if (clientBuildId && clientBuildId !== 'dev' && clientBuildId !== 'dev-latest') {
        if (clientBuildId !== state.buildId || (clientVersion && clientVersion !== state.version)) {
          updateRequired = true;
        }
      } else if (clientVersion && clientVersion !== state.version) {
        updateRequired = true;
      }

      const host = req.get('host') || `${this.config.host}:${this.config.port}`;
      const protocol = req.protocol || 'http';
      const downloadUrl = state.apkAvailable ? `${protocol}://${host}/v1/app/download` : null;

      res.json({
        version: state.version,
        buildId: state.buildId,
        updateRequired,
        apkAvailable: state.apkAvailable,
        downloadUrl,
        message: updateRequired ? 'New app version available' : undefined
      });
    };

    const handleDownloadApk = (_req: Request, res: Response) => {
      const state = getMobileVersionState();
      if (!state.apkAvailable || !state.apkPath) {
        res.status(404).json(this.makeError('NOT_FOUND', 'APK build not found on server'));
        return;
      }
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="ag-remote-${state.version}-${state.buildId}.apk"`);
      const stream = fs.createReadStream(state.apkPath);
      stream.pipe(res);
    };

    this.app.get('/version', handleVersionCheck);
    this.app.get('/app/download', handleDownloadApk);

    this.app.get('/pair', (req: Request, res: Response) => {
      const t = typeof req.query.t === 'string' ? req.query.t : '';
      if (!t || !this.pairingManager.peekValid(t)) {
        res.status(400).json(this.makeError('UNAUTHORIZED', 'Invalid or expired pairing code'));
        return;
      }

      const accept = req.headers.accept || '';
      if (accept.includes('text/html')) {
        res.redirect(302, `/app?token=${encodeURIComponent(t)}`);
        return;
      }

      if (this.pairingManager.verifyAndConsume(t)) {
        const sessionToken = this.tokenManager.getToken();
        res.json({ token: sessionToken });
      } else {
        res.status(400).json(this.makeError('UNAUTHORIZED', 'Pairing code already used'));
      }
    });

    const v1Router = express.Router();
    v1Router.use(this.authMiddleware.bind(this));

    v1Router.get('/version', handleVersionCheck);
    v1Router.get('/app/download', handleDownloadApk);

    v1Router.get('/health', (_req: Request, res: Response) => {
      res.json(this.buildHealthResponse());
    });

    v1Router.get('/windows', (_req: Request, res: Response) => {
      res.json({
        windows: this.windowRegistry.getAll(),
        selectedId: this.windowRegistry.getSelectedId(),
        hostName: os.hostname()
      });
    });

    v1Router.post('/windows/select', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = SelectWindowRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
          return;
        }
        const win = this.windowRegistry.select(parsed.data.windowId);
        if (!win) {
          res.status(404).json(this.makeError('NOT_FOUND', 'Window not found'));
          return;
        }
        const adapter = this.getAdapter(parsed.data.windowId);
        const snapshot = await adapter.getState();
        res.json({ ok: true, status: 'selected', window: win, snapshot, hostName: os.hostname() });
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/hub/register', (req: Request, res: Response) => {
      const parsed = HubRegisterRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
        return;
      }
      this.windowRegistry.register({
        windowId: parsed.data.windowId,
        workspacePath: parsed.data.workspacePath,
        workspaceName: parsed.data.workspaceName,
        pid: parsed.data.pid,
        activeConversationId: parsed.data.activeConversationId
      });
      res.json({ ok: true, registered: true });
    });

    v1Router.post('/hub/heartbeat', (req: Request, res: Response) => {
      const parsed = HubHeartbeatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
        return;
      }
      const ok = this.windowRegistry.heartbeat(parsed.data.windowId, parsed.data.activeConversationId);
      res.json({ ok });
    });

    v1Router.get('/hub/diagnostics', (_req: Request, res: Response) => {
      res.json({
        version: this.config.version,
        windows: this.windowRegistry.getAll(),
        selectedId: this.windowRegistry.getSelectedId()
      });
    });

    v1Router.get('/state', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const windowId = typeof req.query.windowId === 'string' ? req.query.windowId : undefined;
        const adapter = this.getAdapter(windowId);
        const state = await adapter.getState();
        res.json({
          ...state,
          hostName: os.hostname(),
          windowId: windowId ?? this.windowRegistry.getSelectedId()
        });
      } catch (err) {
        next(err);
      }
    });

    v1Router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const windowId = typeof req.query.windowId === 'string' ? req.query.windowId : undefined;
        const adapter = this.getAdapter(windowId);
        const sessions = await adapter.listSessions();
        res.json(sessions);
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = CreateSessionRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
          return;
        }
        const windowId = typeof req.body?.windowId === 'string' ? req.body.windowId : undefined;
        const adapter = this.getAdapter(windowId);
        const sessionId = await adapter.createSession(parsed.data.text, parsed.data.modelId);
        res.json({ ok: true, sessionId });
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/sessions/:id/focus', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = req.params.id;
        if (!sessionId) {
          res.status(400).json(this.makeError('INVALID_BODY', 'Missing session ID'));
          return;
        }
        const windowId = typeof req.body?.windowId === 'string' ? req.body.windowId : undefined;
        const adapter = this.getAdapter(windowId);
        await adapter.focusSession(sessionId);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/sessions/:id/prompt', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = req.params.id;
        const parsed = PromptRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
          return;
        }
        const adapter = this.getAdapter(parsed.data.windowId);
        await adapter.sendPrompt(parsed.data.text, sessionId, parsed.data.modelId);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    v1Router.get('/sessions/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = req.params.id;
        const limitParam = req.query.limit;
        const limit = typeof limitParam === 'string' ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 50)) : 50;
        const windowId = typeof req.query.windowId === 'string' ? req.query.windowId : undefined;
        const adapter = this.getAdapter(windowId);
        const messages = await adapter.getMessages(limit, sessionId);
        res.json(messages);
      } catch (err) {
        next(err);
      }
    });

    v1Router.get('/messages', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limitParam = req.query.limit;
        const limit = typeof limitParam === 'string' ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 50)) : 50;
        const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
        const windowId = typeof req.query.windowId === 'string' ? req.query.windowId : undefined;
        const adapter = this.getAdapter(windowId);
        const messages = await adapter.getMessages(limit, sessionId);
        res.json(messages);
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/prompt', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = PromptRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
          return;
        }
        const sessionId = parsed.data.sessionId ?? (typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined);
        const adapter = this.getAdapter(parsed.data.windowId);
        await adapter.sendPrompt(parsed.data.text, sessionId, parsed.data.modelId);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    v1Router.get('/models', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
        const windowId = typeof req.query.windowId === 'string' ? req.query.windowId : undefined;
        const adapter = this.getAdapter(windowId);
        const models = await adapter.getModels(sessionId);
        res.json(models);
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/models/select', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = SelectModelRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
          return;
        }
        const windowId = typeof req.body?.windowId === 'string' ? req.body.windowId : undefined;
        const adapter = this.getAdapter(windowId);
        await adapter.setModel(parsed.data.modelId, parsed.data.sessionId);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/upload', async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (req.is('application/json')) {
          const parsed = UploadPayloadSchema.safeParse(req.body);
          if (!parsed.success) {
            res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
            return;
          }
          const safeOriginalName = path.basename(parsed.data.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
          const filename = `${Date.now()}_${safeOriginalName}`;
          const targetPath = path.join(this.uploadDir, filename);
          const buffer = Buffer.from(parsed.data.dataBase64, 'base64');
          await fs.promises.writeFile(targetPath, buffer);
          res.json({
            ok: true,
            filename,
            originalName: parsed.data.filename,
            path: targetPath,
            size: buffer.length,
            mimeType: parsed.data.mimeType
          });
          return;
        }

        const rawHeaderName = req.headers['x-filename'] || req.query.filename;
        if (!rawHeaderName || typeof rawHeaderName !== 'string') {
          res.status(400).json(this.makeError('INVALID_BODY', 'Missing filename'));
          return;
        }
        const decodedName = decodeURIComponent(rawHeaderName);
        const safeOriginalName = path.basename(decodedName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${Date.now()}_${safeOriginalName}`;
        const targetPath = path.join(this.uploadDir, filename);

        const writeStream = fs.createWriteStream(targetPath);
        let bytesWritten = 0;
        req.on('data', (chunk: Buffer) => {
          bytesWritten += chunk.length;
        });
        req.pipe(writeStream);
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', () => resolve());
          writeStream.on('error', reject);
          req.on('error', reject);
        });

        res.json({
          ok: true,
          filename,
          originalName: decodedName,
          path: targetPath,
          size: bytesWritten,
          mimeType: req.headers['content-type'] || 'application/octet-stream'
        });
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/approve', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = ApproveRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
          return;
        }
        const adapter = this.getAdapter(parsed.data.windowId);
        try {
          await adapter.approve(parsed.data.requestId, parsed.data.scope, parsed.data.response);
          res.json({ ok: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === 'NO_PENDING_APPROVAL') {
            res.status(409).json(this.makeError('NO_PENDING_APPROVAL', 'No approval is currently pending'));
            return;
          }
          if (msg === 'STALE_REQUEST') {
            res.status(409).json(this.makeError('STALE_REQUEST', 'Provided requestId does not match pending approval'));
            return;
          }
          throw err;
        }
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/reject', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = RejectRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
          return;
        }
        const adapter = this.getAdapter(parsed.data.windowId);
        try {
          await adapter.reject(parsed.data.requestId, parsed.data.reason);
          res.json({ ok: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === 'NO_PENDING_APPROVAL') {
            res.status(409).json(this.makeError('NO_PENDING_APPROVAL', 'No approval is currently pending'));
            return;
          }
          if (msg === 'STALE_REQUEST') {
            res.status(409).json(this.makeError('STALE_REQUEST', 'Provided requestId does not match pending approval'));
            return;
          }
          throw err;
        }
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/stop', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
        const windowId = typeof req.body?.windowId === 'string' ? req.body.windowId : (typeof req.query.windowId === 'string' ? req.query.windowId : undefined);
        const adapter = this.getAdapter(windowId);
        await adapter.stop(sessionId);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/push/test', async (_req: Request, res: Response) => {
      const ok = this.notifier ? await this.notifier.notifyTest() : true;
      res.json({ ok });
    });

    v1Router.get('/settings', async (_req: Request, res: Response) => {
      const qh = this.notifier ? this.notifier.getQuietHours() : { enabled: false, startHour: 23, endHour: 7 };
      let ntfyTopic: string | undefined;
      if (this.notifier) {
        try {
          ntfyTopic = await this.notifier.getOrCreateTopic();
        } catch {}
      }
      res.json({ quietHours: qh, ntfyTopic });
    });

    v1Router.post('/settings', (req: Request, res: Response) => {
      const payload = req.body?.quietHours ?? req.body;
      const parsed = QuietHoursSettingsSchema.safeParse(payload);
      if (!parsed.success) {
        res.status(400).json(this.makeError('INVALID_BODY', parsed.error.message));
        return;
      }
      if (this.notifier) {
        this.notifier.setQuietHours(parsed.data.enabled, parsed.data.startHour, parsed.data.endHour);
      }
      res.json({ ok: true, quietHours: parsed.data });
    });

    this.app.use('/v1', v1Router);
    this.app.use('/api', v1Router);

    this.app.use((_req: Request, res: Response) => {
      res.status(404).json(this.makeError('NOT_FOUND', 'Endpoint not found'));
    });

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json(this.makeError('ADAPTER_UNAVAILABLE', err.message || 'Internal bridge error'));
    });
  }

  private authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    if (isLoopback && (req.path.startsWith('/hub/') || req.path === '/hub')) {
      return next();
    }

    if (this.rateLimiter.isBlocked(ip)) {
      res.status(429).json(this.makeError('RATE_LIMITED', 'Too many failed authentication attempts. Please wait.'));
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.rateLimiter.recordFailure(ip);
      res.status(401).json(this.makeError('UNAUTHORIZED', 'Missing or invalid Authorization header'));
      return;
    }

    const token = authHeader.slice(7).trim();
    const expectedToken = this.tokenManager.getToken();
    if (!expectedToken || !constantTimeCompare(token, expectedToken)) {
      this.rateLimiter.recordFailure(ip);
      res.status(401).json(this.makeError('UNAUTHORIZED', 'Invalid bearer token'));
      return;
    }

    this.rateLimiter.recordSuccess(ip);
    next();
  }

  private buildHealthResponse(): HealthResponse {
    const isFallback = this.tokenManager.getIsFallback();
    const isCdpDegraded = this.config.adapterMode === 'cdp';
    const isDegraded = isFallback || isCdpDegraded;
    let degradedReason: string | undefined;
    if (isFallback) {
      degradedReason = 'Running with insecure fallback token storage';
    } else if (isCdpDegraded) {
      degradedReason = 'IDE started without debug port';
    }

    return {
      status: isDegraded ? 'degraded' : 'ok',
      degradedReason,
      version: this.config.version,
      adapterMode: this.config.adapterMode,
      hostOs: os.platform(),
      hostname: os.hostname(),
      tailscaleIp: this.config.host
    };
  }

  private makeError(code: ApiError['code'], message: string): ApiError {
    return { code, message };
  }

  broadcastEvent(event: AgentEvent): void {
    const serialized = JSON.stringify(event);
    for (const socket of this.sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(serialized);
      }
    }
  }

  async start(): Promise<void> {
    await this.tokenManager.getOrCreateToken();
    return new Promise((resolve, reject) => {
      const server = http.createServer(this.app);
      this.httpServer = server;

      this.wss = new WebSocketServer({ server, path: '/v1/stream' });
      this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
        const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
        const tokenQuery = url.searchParams.get('token');
        const expected = this.tokenManager.getToken();
        if (!tokenQuery || !expected || !constantTimeCompare(tokenQuery, expected)) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        this.sockets.add(ws);
        ws.on('close', () => {
          this.sockets.delete(ws);
        });
      });

      this.windowRegistry.startPruneTimer();

      this.windowRegistry.on('change', (windows) => {
        this.broadcastEvent({
          type: 'windows_changed',
          windows,
          selectedId: this.windowRegistry.getSelectedId(),
          at: Date.now()
        });
      });

      this.multiWindowManager.on('event', (event: AgentEvent) => {
        this.broadcastEvent(event);
        if (event.type === 'run_finished') {
          void this.notifier?.notifyRunFinished(event.sessionId, event.sessionTitle);
        } else if (event.type === 'approval_requested') {
          void this.notifier?.notifyApprovalRequested(event.kind, event.summary, event.sessionId, event.sessionTitle);
        }
      });

      server.listen(this.config.port, this.config.host, () => {
        resolve();
      });

      server.on('error', (err) => {
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    this.windowRegistry.stopPruneTimer();
    this.multiWindowManager.dispose();

    if (this.eventSubscription) {
      this.eventSubscription.dispose();
      this.eventSubscription = null;
    }
    for (const socket of this.sockets) {
      socket.close();
    }
    this.sockets.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
      this.wss = null;
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()));
      this.httpServer = null;
    }
  }

  getApp(): express.Express {
    return this.app;
  }

  getPairingManager(): PairingManager {
    return this.pairingManager;
  }
}

