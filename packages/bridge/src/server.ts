import http from 'http';
import os from 'os';
import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  HealthResponse,
  PromptRequestSchema,
  ApproveRequestSchema,
  RejectRequestSchema,
  AgentEvent,
  ApiError
} from '@ag-remote/shared';
import { RateLimiter, TokenManager, constantTimeCompare } from './auth.js';
import { AgentAdapter } from './adapters/AgentAdapter.js';
import { NtfyNotifier } from './notifier.js';
import { renderWebClientHtml } from './webApp.js';

export interface ServerConfig {
  port: number;
  host: string;
  version: string;
  adapterMode: 'sdk' | 'cdp' | 'fake';
}

export class BridgeServer {
  private readonly config: ServerConfig;
  private readonly adapter: AgentAdapter;
  private readonly tokenManager: TokenManager;
  private readonly rateLimiter: RateLimiter;
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
    notifier?: NtfyNotifier | undefined
  ) {
    this.config = config;
    this.adapter = adapter;
    this.tokenManager = tokenManager;
    this.rateLimiter = rateLimiter;
    this.notifier = notifier;
    this.app = express();
    this.configureApp();
  }

  private configureApp(): void {
    this.app.use(express.json({ limit: '1mb' }));

    this.app.get('/health', (_req: Request, res: Response) => {
      res.json(this.buildHealthResponse());
    });

    this.app.get(['/app', '/app/*'], (_req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderWebClientHtml());
    });

    const v1Router = express.Router();
    v1Router.use(this.authMiddleware.bind(this));

    v1Router.get('/health', (_req: Request, res: Response) => {
      res.json(this.buildHealthResponse());
    });

    v1Router.get('/state', async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const state = await this.adapter.getState();
        res.json(state);
      } catch (err) {
        next(err);
      }
    });

    v1Router.get('/messages', async (req: Request, res: Response, next: NextFunction) => {
      try {
        const limitParam = req.query.limit;
        const limit = typeof limitParam === 'string' ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 50)) : 50;
        const messages = await this.adapter.getMessages(limit);
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
        await this.adapter.sendPrompt(parsed.data.text);
        res.json({ ok: true });
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
        const state = await this.adapter.getState();
        if (!state.pendingApproval) {
          res.status(409).json(this.makeError('NO_PENDING_APPROVAL', 'No approval is currently pending'));
          return;
        }
        if (state.pendingApproval.requestId !== parsed.data.requestId) {
          res.status(409).json(this.makeError('STALE_REQUEST', 'Provided requestId does not match pending approval'));
          return;
        }
        await this.adapter.approve();
        res.json({ ok: true });
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
        const state = await this.adapter.getState();
        if (!state.pendingApproval) {
          res.status(409).json(this.makeError('NO_PENDING_APPROVAL', 'No approval is currently pending'));
          return;
        }
        if (state.pendingApproval.requestId !== parsed.data.requestId) {
          res.status(409).json(this.makeError('STALE_REQUEST', 'Provided requestId does not match pending approval'));
          return;
        }
        await this.adapter.reject();
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/stop', async (_req: Request, res: Response, next: NextFunction) => {
      try {
        await this.adapter.stop();
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    });

    v1Router.post('/push/test', async (_req: Request, res: Response) => {
      const ok = this.notifier ? await this.notifier.notifyTest() : true;
      res.json({ ok });
    });

    this.app.use('/v1', v1Router);

    this.app.use((_req: Request, res: Response) => {
      res.status(404).json(this.makeError('NOT_FOUND', 'Endpoint not found'));
    });

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json(this.makeError('ADAPTER_UNAVAILABLE', err.message || 'Internal bridge error'));
    });
  }

  private authMiddleware(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
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
    return {
      status: this.tokenManager.getIsFallback() ? 'degraded' : 'ok',
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

      this.eventSubscription = this.adapter.onEvent((event) => {
        this.broadcastEvent(event);
        if (event.type === 'run_finished') {
          void this.notifier?.notifyRunFinished(event.sessionId);
        } else if (event.type === 'approval_requested') {
          void this.notifier?.notifyApprovalRequested(event.kind, event.summary);
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
}

