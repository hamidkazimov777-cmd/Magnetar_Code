/** A configured endpoint. The API key is NOT here — it lives in the OS keychain
 *  and is looked up by `id`. See secrets.ts. */
export interface ProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  /** Model used when a session does not pin its own. */
  model: string;
  /** Last known model list, cached so `/model` opens instantly offline. */
  models?: string[];
  keyless?: boolean;
}

export type PermissionMode = "ask" | "auto-edit" | "yolo";

export interface MagnetarConfig {
  version: 1;
  providers: ProviderProfile[];
  activeProviderId?: string;
  permissionMode: PermissionMode;
  /** UI language for the CLI and the monitor. */
  locale?: "en" | "ru";
  theme?: string;
}

export const DEFAULT_CONFIG: MagnetarConfig = {
  version: 1,
  providers: [],
  permissionMode: "ask",
};
