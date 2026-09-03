export const VERSION = "0.1.0";

export { magnetarHome, configFile, projectSessionsDir, projectMemoryFile } from "./paths.js";

export { PRESETS, normalizeBaseUrl, type Preset } from "./config/presets.js";
export {
  DEFAULT_CONFIG,
  type MagnetarConfig,
  type PermissionMode,
  type ProviderProfile,
} from "./config/types.js";
export {
  loadConfig,
  saveConfig,
  providerId,
  activeProvider,
  projectConfigFile,
} from "./config/config.js";
export { getSecret, setSecret, deleteSecret, type SecretBackend } from "./config/secrets.js";

export { OpenAICompatibleProvider, type ProviderTransport } from "./providers/openai.js";
export { parseModelsResponse } from "./providers/models.js";
export { sseLines, ToolCallAccumulator } from "./providers/sse.js";
export {
  ProviderError,
  type ChatRequest,
  type Message,
  type StreamEvent,
  type ToolCall,
  type ToolSchema,
  type Usage,
} from "./providers/types.js";

export * from "./tools/index.js";
export {
  Permissions,
  isReadOnlyCommand,
  type Approval,
  type Decision,
  type PermissionRules,
} from "./permissions/permissions.js";
export { Session, type SessionMeta } from "./session/session.js";

export {
  runAgent,
  type AgentEvent,
  type AgentOptions,
  type AgentResult,
  type ApprovalRequest,
  type StopReason,
} from "./agent/loop.js";
export { buildSystemPrompt, type PromptContext } from "./agent/prompt.js";
export {
  compact,
  shouldCompact,
  transcriptTokens,
  COMPACT_THRESHOLD_TOKENS,
} from "./agent/compact.js";
export { estimateCost, estimateTokens, formatCost, priceFor } from "./agent/cost.js";

export { startDaemon, type Daemon, type DaemonDeps } from "./server/server.js";
export type {
  ApproveRequestBody,
  ChatRequestBody,
  FileEntry,
  SessionResponse,
  StateResponse,
  StreamMessage,
} from "./server/protocol.js";
