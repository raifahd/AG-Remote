import { z } from 'zod';
import {
  ErrorCodeSchema,
  ApiErrorSchema,
  RunStatusSchema,
  ApprovalKindSchema,
  ApprovalOptionSchema,
  PendingApprovalSchema,
  SessionSummarySchema,
  AgentStateSchema,
  ChatMessageSchema,
  PromptRequestSchema,
  ApproveRequestSchema,
  RejectRequestSchema,
  HealthResponseSchema,
  StatusChangedEventSchema,
  ApprovalRequestedEventSchema,
  RunFinishedEventSchema,
  MessageAppendedEventSchema,
  SessionCreatedEventSchema,
  ActiveSessionChangedEventSchema,
  BridgeErrorEventSchema,
  AgentEventSchema,
  CreateSessionRequestSchema,
  FocusSessionRequestSchema,
  ModelInfoSchema,
  ModelsResponseSchema,
  SelectModelRequestSchema,
  RegisteredWindowSchema,
  WindowsResponseSchema,
  SelectWindowRequestSchema,
  HubRegisterRequestSchema,
  HubHeartbeatRequestSchema,
  WindowsChangedEventSchema
} from './schemas.js';

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type ApprovalKind = z.infer<typeof ApprovalKindSchema>;
export type ApprovalOption = z.infer<typeof ApprovalOptionSchema>;
export type PendingApproval = z.infer<typeof PendingApprovalSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type PromptRequest = z.infer<typeof PromptRequestSchema>;
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;
export type RejectRequest = z.infer<typeof RejectRequestSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type FocusSessionRequest = z.infer<typeof FocusSessionRequestSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;
export type SelectModelRequest = z.infer<typeof SelectModelRequestSchema>;

export type RegisteredWindow = z.infer<typeof RegisteredWindowSchema>;
export type WindowsResponse = z.infer<typeof WindowsResponseSchema>;
export type SelectWindowRequest = z.infer<typeof SelectWindowRequestSchema>;
export type HubRegisterRequest = z.infer<typeof HubRegisterRequestSchema>;
export type HubHeartbeatRequest = z.infer<typeof HubHeartbeatRequestSchema>;
export type WindowsChangedEvent = z.infer<typeof WindowsChangedEventSchema>;

export type StatusChangedEvent = z.infer<typeof StatusChangedEventSchema>;
export type ApprovalRequestedEvent = z.infer<typeof ApprovalRequestedEventSchema>;
export type RunFinishedEvent = z.infer<typeof RunFinishedEventSchema>;
export type MessageAppendedEvent = z.infer<typeof MessageAppendedEventSchema>;
export type SessionCreatedEvent = z.infer<typeof SessionCreatedEventSchema>;
export type ActiveSessionChangedEvent = z.infer<typeof ActiveSessionChangedEventSchema>;
export type BridgeErrorEvent = z.infer<typeof BridgeErrorEventSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;

