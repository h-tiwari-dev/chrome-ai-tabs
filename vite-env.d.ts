/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXAMPLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ai: AI;
}

// Define the AI types
interface AI {
  languageModel: AILanguageModelFactory;
}

interface AILanguageModelFactory {
  create(options?: AILanguageModelCreateOptions): Promise<AILanguageModel>;
  capabilities(): Promise<AILanguageModelCapabilities>;
}

interface AILanguageModel extends EventTarget {
  prompt(input: string, options?: AILanguageModelPromptOptions): Promise<string>;
  promptStreaming(input: string, options?: AILanguageModelPromptOptions): ReadableStream<string>;

  countPromptTokens(input: string, options?: AILanguageModelPromptOptions): Promise<number>;
  readonly maxTokens: number;
  readonly tokensSoFar: number;
  readonly tokensLeft: number;
  readonly topK: number;
  readonly temperature: number;

  clone(): Promise<AILanguageModel>;
  destroy(): void;
}

interface AILanguageModelCapabilities {
  readonly available: AICapabilityAvailability;
  readonly defaultTopK: number | null;
  readonly maxTopK: number | null;
  readonly defaultTemperature: number | null;
}

interface AICreateMonitor extends EventTarget {
  ondownloadprogress: ((event: AIDownloadProgressEvent) => void) | null;
}

interface AIDownloadProgressEvent extends Event {
  readonly loaded: number;
  readonly total: number;
}

type AICreateMonitorCallback = (monitor: AICreateMonitor) => void;

type AICapabilityAvailability = 'readily' | 'after-download' | 'no';

interface AILanguageModelCreateOptions {
  signal?: AbortSignal;
  monitor?: AICreateMonitorCallback;
  systemPrompt?: string;
  initialPrompts?: AILanguageModelPrompt[];
  topK?: number;
  temperature?: number;
}

interface AILanguageModelPrompt {
  role: AILanguageModelPromptRole;
  content: string;
}

interface AILanguageModelPromptOptions {
  signal?: AbortSignal;
}

type AILanguageModelPromptRole = 'system' | 'user' | 'assistant';

// Extend Chrome namespace
declare namespace chrome {
  const ai: {
    languageModel: AILanguageModelFactory;
  };
}
