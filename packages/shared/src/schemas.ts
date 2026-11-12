import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'INVALID_BODY',
  'NO_PENDING_APPROVAL',
  'STALE_REQUEST',
  'ADAPTER_UNAVAILABLE',
  'RATE_LIMITED',
  'NOT_FOUND'
]);

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string()
}).strict();

export const RunStatusSchema = z.enum([
  'idle',
  'generating',
  'awaiting_approval',
  'error'
]);

export const ApprovalKindSchema = z.enum([
  'edit',
  'terminal',
  'tool'
]);

export const PendingApprovalSchema = z.object({
  requestId: z.string().min(1),
  sessionId: z.string().optional(),
  kind: ApprovalKindSchema,
  summary: z.string(),
  createdAt: z.number().int().nonnegative()
}).strict();

export const SessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  stepCount: z.number().int().nonnegative().optional(),
  lastActivityAt: z.number().int().nonnegative().optional(),
  status: RunStatusSchema.optional(),
  workspace: z.string().optional(),
  lastModified: z.number().int().nonnegative().optional()
}).strict();

export const AgentStateSchema = z.object({
  sessions: z.array(SessionSummarySchema),
  activeSessionId: z.string().nullable(),
  status: RunStatusSchema,
  pendingApproval: PendingApprovalSchema.nullable()
}).strict();

export const ChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'agent']),
  text: z.string(),
  timestamp: z.number().int().nonnegative()
}).strict();

export const PromptRequestSchema = z.object({
  text: z.string().min(1),
  modelId: z.string().optional()
}).strict();

export const ApproveRequestSchema = z.object({
  requestId: z.string().min(1)
}).strict();

export const RejectRequestSchema = z.object({
  requestId: z.string().min(1)
}).strict();

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  degradedReason: z.string().optional(),
  version: z.string(),
  adapterMode: z.enum(['sdk', 'cdp', 'fake']),
  hostOs: z.string(),
  hostname: z.string(),
  tailscaleIp: z.string().nullable()
}).strict();

export const QuietHoursSettingsSchema = z.object({
  enabled: z.boolean(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23)
}).strict();

export type QuietHoursSettings = z.infer<typeof QuietHoursSettingsSchema>;

export const StatusChangedEventSchema = z.object({
  type: z.literal('status_changed'),
  sessionId: z.string(),
  status: RunStatusSchema,
  at: z.number().int().nonnegative()
}).strict();

export const ApprovalRequestedEventSchema = z.object({
  type: z.literal('approval_requested'),
  requestId: z.string(),
  sessionId: z.string().optional(),
  sessionTitle: z.string().optional(),
  kind: ApprovalKindSchema,
  summary: z.string(),
  at: z.number().int().nonnegative()
}).strict();

export const RunFinishedEventSchema = z.object({
  type: z.literal('run_finished'),
  sessionId: z.string(),
  sessionTitle: z.string().optional(),
  at: z.number().int().nonnegative()
}).strict();

export const MessageAppendedEventSchema = z.object({
  type: z.literal('message_appended'),
  sessionId: z.string(),
  sessionTitle: z.string().optional(),
  role: z.enum(['user', 'agent']),
  text: z.string(),
  at: z.number().int().nonnegative()
}).strict();

export const SessionCreatedEventSchema = z.object({
  type: z.literal('session_created'),
  sessionId: z.string(),
  title: z.string(),
  at: z.number().int().nonnegative()
}).strict();

export const ActiveSessionChangedEventSchema = z.object({
  type: z.literal('active_session_changed'),
  sessionId: z.string(),
  previousSessionId: z.string().optional(),
  title: z.string().optional(),
  at: z.number().int().nonnegative()
}).strict();

export const BridgeErrorEventSchema = z.object({
  type: z.literal('bridge_error'),
  message: z.string(),
  at: z.number().int().nonnegative()
}).strict();

export const AgentEventSchema = z.discriminatedUnion('type', [
  StatusChangedEventSchema,
  ApprovalRequestedEventSchema,
  RunFinishedEventSchema,
  MessageAppendedEventSchema,
  SessionCreatedEventSchema,
  ActiveSessionChangedEventSchema,
  BridgeErrorEventSchema
]);

export const CreateSessionRequestSchema = z.object({
  text: z.string().optional(),
  modelId: z.string().optional()
}).strict();

export const FocusSessionRequestSchema = z.object({
  sessionId: z.string().optional()
}).strict();

export const ModelInfoSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  model: z.string().optional(),
  remainingFraction: z.number().optional(),
  resetTime: z.string().optional(),
  isCurrent: z.boolean().optional()
}).strict();

export const ModelsResponseSchema = z.object({
  models: z.array(ModelInfoSchema),
  currentModelId: z.string().optional()
}).strict();

export const SelectModelRequestSchema = z.object({
  modelId: z.string().min(1),
  sessionId: z.string().optional()
}).strict();

export const PairingPayloadSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
  ntfyTopic: z.string().optional()
}).passthrough();

export type PairingPayload = z.infer<typeof PairingPayloadSchema>;

export const UploadPayloadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().default('application/octet-stream'),
  dataBase64: z.string().min(1)
}).strict();

export type UploadPayload = z.infer<typeof UploadPayloadSchema>;

export const UploadResponseSchema = z.object({
  ok: z.literal(true),
  filename: z.string(),
  originalName: z.string(),
  path: z.string(),
  size: z.number().int().nonnegative(),
  mimeType: z.string()
}).strict();

export type UploadResponse = z.infer<typeof UploadResponseSchema>;


