import { z } from 'zod';

export const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string(),
  params: z.unknown().optional(),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
});

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcId = string | number | null;

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcError;
  id: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
} as const;

// Tab 関連の型定義
export interface TabInfo {
  uri: string | null;
  label: string;
  isActive: boolean;
  isDirty: boolean;
  groupIndex: number;
  index: number;
}

export interface TabsListResult {
  tabs: TabInfo[];
  activeTabUri: string | null;
}

export interface TabsCloseResult {
  success: boolean;
  closed: boolean;
}

// tabs.list params schema
export const TabsListParamsSchema = z.object({
  includeGroupInfo: z.boolean().optional().default(true),
}).optional();

// tabs.close params schema
export const TabsCloseParamsSchema = z.object({
  uri: z.string(),
  save: z.boolean().optional().default(false),
});

export type TabsListParams = z.infer<typeof TabsListParamsSchema>;
export type TabsCloseParams = z.infer<typeof TabsCloseParamsSchema>;

// chat.send params schema
export const ChatSendParamsSchema = z.object({
  prompt: z.string(),
});

export type ChatSendParams = z.infer<typeof ChatSendParamsSchema>;

// chat.query params schema (send prompt and get response)
export const ChatQueryParamsSchema = z.object({
  prompt: z.string(),
  model: z.string().optional(),  // e.g., 'gpt-4o', 'gpt-4o-mini'
  timeout: z.number().optional().default(60000),  // ms
});

export type ChatQueryParams = z.infer<typeof ChatQueryParamsSchema>;

// chat.query result
export interface ChatQueryResult {
  response: string;
  model: string;
}
