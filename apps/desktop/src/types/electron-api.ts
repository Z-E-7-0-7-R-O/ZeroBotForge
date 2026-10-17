export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ProjectNodeDto {
  id: string;
  type: string;
  label: string;
  position: { x: number; y: number };
  data: Record<string, JsonValue>;
}

export interface ProjectEdgeDto {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

export interface ProjectFlowDto {
  id: string;
  name: string;
  description?: string;
  nodes: ProjectNodeDto[];
  edges: ProjectEdgeDto[];
}

export interface ProjectDocumentDto {
  format: "zerobotforge.project";
  formatVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  metadata: { description: string; tags: string[]; author?: string };
  bot: {
    displayName: string;
    username?: string;
    tokenEnvVar: string;
    parseMode: "HTML" | "Markdown" | "MarkdownV2" | null;
  };
  flows: ProjectFlowDto[];
  activeFlowId: string | null;
  generation: {
    language: "typescript";
    runtime: "node";
    nodeVersion: number;
    moduleFormat: "esm" | "commonjs";
    packageManager: "npm" | "pnpm" | "yarn";
    strict: boolean;
    includeReadme: boolean;
    includeTests: boolean;
  };
}

export interface DesktopApiError {
  code: string;
  message: string;
}

export type DesktopApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DesktopApiError };

export interface ProjectSession {
  document: ProjectDocumentDto;
  filePath: string | null;
  fileName: string | null;
}

export type AppTheme = "light" | "dark" | "system";
export interface AppSettings {
  theme: AppTheme;
  autoSaveEnabled: boolean;
  autoSaveIntervalSeconds: number;
  reopenLastProject: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  architecture: string;
  isPackaged: boolean;
}

export interface TelegramConnectionStatus {
  configured: boolean;
  connected: boolean | null;
  botUsername?: string;
}

export interface ExportProjectResult {
  filePath: string;
  fileName?: string;
}

export interface GeneratedProjectFile {
  path: string;
  content: string;
}

export interface ExportGeneratedProjectResult {
  directoryPath: string;
  directoryName: string;
  projectName: string;
  filesWritten: number;
  tokenConfigured?: boolean;
}

export type RuntimeLifecycleState =
  | "idle"
  | "generated"
  | "compiling"
  | "compiled"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export interface RuntimeLogEntry {
  id: number;
  timestamp: string;
  stream: "stdout" | "stderr" | "system";
  message: string;
}

export interface BotRuntimeStatus {
  state: RuntimeLifecycleState;
  directoryPath: string | null;
  directoryName: string | null;
  projectName: string | null;
  isGenerated: boolean;
  isCompiled: boolean;
  isRunning: boolean;
  pid: number | null;
  startedAt: string | null;
  compiledAt: string | null;
  lastExitCode: number | null;
  lastError: string | null;
  tokenConfigured: boolean;
  tokenSyncedToEnv: boolean;
  telegramConnected: boolean | null;
  botUsername: string | null;
  logs: RuntimeLogEntry[];
}

export interface DesktopApi {
  projects: {
    create(input?: { name?: string }): Promise<DesktopApiResult<ProjectSession>>;
    open(): Promise<DesktopApiResult<ProjectSession | null>>;
    save(input: { document: ProjectDocumentDto }): Promise<DesktopApiResult<ProjectSession | null>>;
    saveAs(input: { document: ProjectDocumentDto }): Promise<DesktopApiResult<ProjectSession | null>>;
  };
  exports: {
    projectJson(input: { document: ProjectDocumentDto }): Promise<DesktopApiResult<ExportProjectResult | null>>;
    generatedProject(input: { projectName: string; files: GeneratedProjectFile[] }): Promise<DesktopApiResult<ExportGeneratedProjectResult | null>>;
    updateGeneratedProject(input: {
      projectName: string;
      files: GeneratedProjectFile[];
      directoryPath?: string;
    }): Promise<DesktopApiResult<ExportGeneratedProjectResult>>;
  };
  system: {
    getVersion(): Promise<DesktopApiResult<AppInfo>>;
    settings: {
      get(): Promise<DesktopApiResult<AppSettings>>;
      save(input: { settings: AppSettings }): Promise<DesktopApiResult<AppSettings>>;
    };
  };
  telegram: {
    getStatus(): Promise<DesktopApiResult<TelegramConnectionStatus>>;
    setToken(input: { token: string }): Promise<DesktopApiResult<TelegramConnectionStatus>>;
    clearToken(): Promise<DesktopApiResult<TelegramConnectionStatus>>;
    testConnection(): Promise<DesktopApiResult<TelegramConnectionStatus>>;
  };
  runtime?: {
    getStatus(input?: { checkTelegram?: boolean }): Promise<DesktopApiResult<BotRuntimeStatus>>;
    openGeneratedProject(): Promise<DesktopApiResult<BotRuntimeStatus | null>>;
    compile(input?: { directoryPath?: string }): Promise<DesktopApiResult<BotRuntimeStatus>>;
    start(input?: { directoryPath?: string }): Promise<DesktopApiResult<BotRuntimeStatus>>;
    stop(): Promise<DesktopApiResult<BotRuntimeStatus>>;
    clearLogs(): Promise<DesktopApiResult<BotRuntimeStatus>>;
    deleteGeneratedProject(input?: { directoryPath?: string }): Promise<DesktopApiResult<BotRuntimeStatus>>;
  };
}