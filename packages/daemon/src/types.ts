import { z } from 'zod';
import type * as net from 'node:net';

// 内部プロトコルのメッセージ型

export const RegisterMessageSchema = z.object({
  type: z.literal('register'),
  extensionId: z.string(),
});

export const RegisterAckMessageSchema = z.object({
  type: z.literal('register-ack'),
  success: z.boolean(),
  error: z.string().optional(),
});

export const UnregisterAckMessageSchema = z.object({
  type: z.literal('unregister-ack'),
  success: z.boolean(),
  error: z.string().optional(),
});

export const InternalMessageSchema = z.union([
  RegisterMessageSchema,
  RegisterAckMessageSchema,
  UnregisterAckMessageSchema,
]);

export type RegisterMessage = z.infer<typeof RegisterMessageSchema>;
export type RegisterAckMessage = z.infer<typeof RegisterAckMessageSchema>;
export type UnregisterAckMessage = z.infer<typeof UnregisterAckMessageSchema>;
export type InternalMessage = z.infer<typeof InternalMessageSchema>;

// JSON-RPC メッセージ型（既存のプロトコル）

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

export const JsonRpcResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }).optional(),
  id: z.union([z.string(), z.number(), z.null()]),
});

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

// Extension host 情報

export interface ExtensionHostInfo {
  extensionId: string;
  socket: net.Socket;
  registeredAt: Date;
}
