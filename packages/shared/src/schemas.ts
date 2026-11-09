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
  kind: ApprovalKindSchema,
  summary: z.string(),
  createdAt: z.number().int().nonnegative()
}).strict();

export const SessionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
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
  text: z.string().min(1)
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
  kind: ApprovalKindSchema,
  summary: z.string(),
  at: z.number().int().nonnegative()
}).strict();

export const RunFinishedEventSchema = z.object({
  type: z.literal('run_finished'),
  sessionId: z.string(),
  at: z.number().int().nonnegative()
}).strict();

export const MessageAppendedEventSchema = z.object({
  type: z.literal('message_appended'),
  sessionId: z.string(),
  role: z.enum(['user', 'agent']),
  text: z.string(),
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
  BridgeErrorEventSchema
]);

export const PairingPayloadSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
  ntfyTopic: z.string().optional()
}).passthrough();

export type PairingPayload = z.infer<typeof PairingPayloadSchema>;


