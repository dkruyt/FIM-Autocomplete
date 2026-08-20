import Parser from "web-tree-sitter";
import { LLMConfigurationStatuses } from "./llm/constants";

// Minimal local stand-ins for types that used to come from upstream Continue's
// @continuedev/config-yaml and @continuedev/terminal-security packages. Those
// served its chat/agent config system, which this fork does not have. Only the
// shapes autocomplete actually touches are kept.

export type ModelRole =
  "chat" | "autocomplete" | "embed" | "rerank" | "edit" | "apply" | "summarize";

export interface PromptTemplates {
  autocomplete?: string;
  [key: string]: string | undefined;
}

export type ToolPolicy =
  "allowedWithPermission" | "allowedWithoutPermission" | "disabled";

export interface ToolOverrideConfig {
  displayTitle?: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export interface ChunkWithoutID {
  content: string;
  startLine: number;
  endLine: number;
  signature?: string;
  otherMetadata?: { [key: string]: any };
}

export interface Chunk extends ChunkWithoutID {
  digest: string;
  filepath: string;
  index: number; // Index of the chunk in the document at filepath
}

export type PromptTemplateFunction = (
  history: ChatMessage[],
  otherData: Record<string, string>,
) => string | ChatMessage[];

export type PromptTemplate = string | PromptTemplateFunction;

type RequiredLLMOptions =
  | "uniqueId"
  | "contextLength"
  | "embeddingId"
  | "maxEmbeddingChunkSize"
  | "maxEmbeddingBatchSize"
  | "completionOptions";

export interface ILLM
  extends
    Omit<LLMOptions, RequiredLLMOptions>,
    Required<Pick<LLMOptions, RequiredLLMOptions>> {
  get providerName(): string;
  get underlyingProviderName(): string;

  autocompleteOptions?: Partial<TabAutocompleteOptions>;

  lastRequestId?: string;

  complete(
    prompt: string,
    signal: AbortSignal,
    options?: LLMFullCompletionOptions,
  ): Promise<string>;

  streamComplete(
    prompt: string,
    signal: AbortSignal,
    options?: LLMFullCompletionOptions,
  ): AsyncGenerator<string, PromptLog>;

  streamFim(
    prefix: string,
    suffix: string,
    signal: AbortSignal,
    options?: LLMFullCompletionOptions,
  ): AsyncGenerator<string, PromptLog>;

  streamChat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options?: LLMFullCompletionOptions,
    messageOptions?: MessageOption,
  ): AsyncGenerator<ChatMessage, PromptLog>;

  chat(
    messages: ChatMessage[],
    signal: AbortSignal,
    options?: LLMFullCompletionOptions,
  ): Promise<ChatMessage>;

  compileChatMessages(
    messages: ChatMessage[],
    options: LLMFullCompletionOpeions,
  ): CompiledChatMessagesReport;

  embed(chunks: string[]): Promise<number[][]>;

  rerank(query: string, chunks: Chunk[]): Promise<number[]>;

  countTokens(text: string): number;

  supportsImages(): boolean;

  supportsCompletions(): boolean;

  supportsPrefill(): boolean;

  supportsFim(): boolean;

  listModels(): Promise<string[]>;

  renderPromptTemplate(
    template: PromptTemplate,
    history: ChatMessage[],
    otherData: Record<string, string>,
    canPutWordsInModelsMouth?: boolean,
  ): string | ChatMessage[];

  getConfigurationStatus(): LLMConfigurationStatuses;
}

export interface ModelInstaller {
  installModel(
    modelName: string,
    signal: AbortSignal,
    progressReporter?: (task: string, increment: number, total: number) => void,
  ): Promise<any>;

  isInstallingModel(modelName: string): Promise<boolean>;
}

export interface RangeInFile {
  filepath: string;
  range: Range;
}

export interface Location {
  filepath: string;
  position: Position;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  character: number;
}

export interface CompletionOptions extends BaseCompletionOptions {
  model: string;
}

export type ChatMessageRole =
  "user" | "assistant" | "thinking" | "system" | "tool";

export type TextMessagePart = {
  type: "text";
  text: string;
};

export type ImageMessagePart = {
  type: "imageUrl";
  imageUrl: { url: string };
};

export type MessagePart = TextMessagePart | ImageMessagePart;

export type MessageContent = string | MessagePart[];

export interface ToolCallDelta {
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ToolResultChatMessage {
  role: "tool";
  content: string;
  toolCallId: string;
  /** Arbitrary per-message metadata (IDs, provider-specific info, etc.) */
  metadata?: Record<string, unknown>;
}

export interface UserChatMessage {
  role: "user";
  content: MessageContent;
  /** Arbitrary per-message metadata (IDs, provider-specific info, etc.) */
  metadata?: Record<string, unknown>;
}

export interface ThinkingChatMessage {
  role: "thinking";
  content: MessageContent;
  signature?: string;
  redactedThinking?: string;
  toolCalls?: ToolCallDelta[];
  reasoning_details?: {
    signature?: string;
    [key: string]: any;
  }[];
  /** Arbitrary per-message metadata (IDs, provider-specific info, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * This is meant to be equivalent to the OpenAI [usage object](https://platform.openai.com/docs/api-reference/chat/object#chat/object-usage)
 * but potentially with additional information that is needed for other providers.
 */
export interface Usage {
  completionTokens: number;
  promptTokens: number;
  promptTokensDetails?: {
    cachedTokens?: number;
    /** This an Anthropic-specific property */
    cacheWriteTokens?: number;
    audioTokens?: number;
  };
  completionTokensDetails?: {
    acceptedPredictionTokens?: number;
    reasoningTokens?: number;
    rejectedPredictionTokens?: number;
    audioTokens?: number;
  };
}

export interface AssistantChatMessage {
  role: "assistant";
  content: MessageContent;
  toolCalls?: ToolCallDelta[];
  usage?: Usage;
  /** Arbitrary per-message metadata (IDs, provider-specific info, etc.) */
  metadata?: Record<string, unknown>;
}

export interface SystemChatMessage {
  role: "system";
  content: string;
  /** Arbitrary per-message metadata (IDs, provider-specific info, etc.) */
  metadata?: Record<string, unknown>;
}

export type ChatMessage =
  | UserChatMessage
  | AssistantChatMessage
  | ThinkingChatMessage
  | SystemChatMessage
  | ToolResultChatMessage;

export type ContextItemUriTypes = "file" | "url";

export interface ContextItemUri {
  type: ContextItemUriTypes;
  value: string;
}

export interface ContextItem {
  content: string;
  name: string;
  description: string;
  editing?: boolean;
  editable?: boolean;
  icon?: string;
  uri?: ContextItemUri;
  hidden?: boolean;
  status?: string;
}

export interface SymbolWithRange extends RangeInFile {
  name: string;
  type: Parser.SyntaxNode["type"];
  content: string;
}

export type FileSymbolMap = Record<string, SymbolWithRange[]>;

export interface PromptLog {
  modelTitle: string;
  modelProvider: string;
  prompt: string;
  completion: string;
}

interface McpUiState {
  content: unknown;
}

// Will exist only on "assistant" messages with tool calls
interface ToolCallState {
  toolCallId: string;
  toolCall: ToolCall;
  status: ToolStatus;
  parsedArgs: any;
  processedArgs?: Record<string, any>; // Added in preprocesing step
  output?: ContextItem[];
  tool?: Tool;
  mcpUiState?: McpUiState;
}

interface Reasoning {
  active: boolean;
  text: string;
  startAt: number;
  endAt?: number;
}

export interface LLMFullCompletionOptions extends BaseCompletionOptions {
  log?: boolean;
  model?: string;
}

export type ToastType = "info" | "error" | "warning";

export interface LLMInteractionBase {
  interactionId: string;
  timestamp: number;
}

export interface LLMInteractionStartChat extends LLMInteractionBase {
  kind: "startChat";
  messages: ChatMessage[];
  options: CompletionOptions;
  provider: string;
}

export interface LLMInteractionStartComplete extends LLMInteractionBase {
  kind: "startComplete";
  prompt: string;
  options: CompletionOptions;
  provider: string;
}

export interface LLMInteractionStartFim extends LLMInteractionBase {
  kind: "startFim";
  prefix: string;
  suffix: string;
  options: CompletionOptions;
  provider: string;
}

export interface LLMInteractionChunk extends LLMInteractionBase {
  kind: "chunk";
  chunk: string;
}

export interface LLMInteractionMessage extends LLMInteractionBase {
  kind: "message";
  message: ChatMessage;
}

export interface LLMInteractionEnd extends LLMInteractionBase {
  promptTokens: number;
  generatedTokens: number;
  thinkingTokens: number;
  usage: Usage | undefined;
}

export interface LLMInteractionSuccess extends LLMInteractionEnd {
  kind: "success";
}

export interface LLMInteractionCancel extends LLMInteractionEnd {
  kind: "cancel";
}

export interface LLMInteractionError extends LLMInteractionEnd {
  kind: "error";
  name: string;
  message: string;
}

export type LLMInteractionItem =
  | LLMInteractionStartChat
  | LLMInteractionStartComplete
  | LLMInteractionStartFim
  | LLMInteractionChunk
  | LLMInteractionMessage
  | LLMInteractionSuccess
  | LLMInteractionCancel
  | LLMInteractionError;

// When we log a LLM interaction, we want to add the interactionId and timestamp
// in the logger code, so we need a type that omits these members from *each*
// member of the union. This can be done by using the distributive behavior of
// conditional types in Typescript.
//
// www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types
// https://stackoverflow.com/questions/57103834/typescript-omit-a-property-from-all-interfaces-in-a-union-but-keep-the-union-s
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type LLMInteractionItemDetails = DistributiveOmit<
  LLMInteractionItem,
  "interactionId" | "timestamp"
>;

export interface ILLMInteractionLog {
  logItem(item: LLMInteractionItemDetails): void;
}

export interface ILLMLogger {
  createInteractionLog(): ILLMInteractionLog;
}

export interface LLMOptions {
  model: string;

  title?: string;
  uniqueId?: string;
  baseAgentSystemMessage?: string;
  basePlanSystemMessage?: string;
  baseChatSystemMessage?: string;
  autocompleteOptions?: Partial<TabAutocompleteOptions>;
  contextLength?: number;
  maxStopWords?: number;
  completionOptions?: CompletionOptions;
  requestOptions?: RequestOptions;
  template?: TemplateType;
  promptTemplates?: Partial<Record<keyof PromptTemplates, PromptTemplate>>;
  templateMessages?: (messages: ChatMessage[]) => string;
  logger?: ILLMLogger;
  llmRequestHook?: (model: string, prompt: string) => any;
  apiKey?: string;

  apiKeyLocation?: string;
  envSecretLocations?: Record<string, string>;
  apiBase?: string;

  onPremProxyUrl?: string | null;

  aiGatewaySlug?: string;
  cacheBehavior?: CacheBehavior;
  capabilities?: ModelCapability;
  roles?: ModelRole[];

  useLegacyCompletionsEndpoint?: boolean;
  useResponsesApi?: boolean;

  // Embedding options
  embeddingId?: string;
  maxEmbeddingChunkSize?: number;
  maxEmbeddingBatchSize?: number;

  // Cloudflare options
  accountId?: string;

  // Azure options
  deployment?: string;
  apiVersion?: string;
  apiType?: string;

  // AWS options
  profile?: string;
  modelArn?: string;
  accessKeyId?: string;
  secretAccessKey?: string;

  // AWS and VertexAI Options
  region?: string;

  // VertexAI and Watsonx Options
  projectId?: string;

  // IBM watsonx Options
  deploymentId?: string;

  env?: Record<string, string | number | boolean>;

  sourceFile?: string;
  isFromAutoDetect?: boolean;

  /** Tool overrides for this model */
  toolOverrides?: ToolOverride[];
}

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export type DiffType = "new" | "old" | "same";

export interface DiffObject {
  type: DiffType;
}

export interface DiffLine extends DiffObject {
  line: string;
}

interface DiffChar extends DiffObject {
  char: string;
  oldIndex?: number; // Character index assuming a flattened line string.
  newIndex?: number;
  oldCharIndexInLine?: number; // Character index assuming new lines reset the character index to 0.
  newCharIndexInLine?: number;
  oldLineIndex?: number;
  newLineIndex?: number;
}

export interface Problem {
  filepath: string;
  range: Range;
  message: string;
}

export interface Thread {
  name: string;
  id: number;
}

export type IdeType = "vscode" | "jetbrains";

export interface IdeInfo {
  ideType: IdeType;
  name: string;
  version: string;
  remoteName: string;
  extensionVersion: string;
  isPrerelease: boolean;
}

export interface BranchAndDir {
  branch: string;
  directory: string;
}

export interface IndexTag extends BranchAndDir {
  artifactId: string;
}

export enum FileType {
  Unkown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export interface FileStats {
  size: number;
  lastModified: number;
}

/** Map of file name to stats */
export type FileStatsMap = {
  [path: string]: FileStats;
};

export interface IDE {
  getIdeInfo(): Promise<IdeInfo>;

  getDiff(includeUnstaged: boolean): Promise<string[]>;

  getClipboardContent(): Promise<{ text: string; copiedAt: string }>;

  isWorkspaceRemote(): Promise<boolean>;

  getUniqueId(): Promise<string>;

  getTerminalContents(): Promise<string>;

  getWorkspaceDirs(): Promise<string[]>;

  fileExists(fileUri: string): Promise<boolean>;

  writeFile(path: string, contents: string): Promise<void>;

  removeFile(path: string): Promise<void>;

  openFile(path: string): Promise<void>;

  openUrl(url: string): Promise<void>;

  getExternalUri?(uri: string): Promise<string>;

  runCommand(command: string, options?: TerminalOptions): Promise<void>;

  saveFile(fileUri: string): Promise<void>;

  readFile(fileUri: string): Promise<string>;

  readRangeInFile(fileUri: string, range: Range): Promise<string>;

  showLines(fileUri: string, startLine: number, endLine: number): Promise<void>;

  getOpenFiles(): Promise<string[]>;

  getCurrentFile(): Promise<
    | undefined
    | {
        isUntitled: boolean;
        path: string;
        contents: string;
      }
  >;

  getPinnedFiles(): Promise<string[]>;

  subprocess(command: string, cwd?: string): Promise<[string, string]>;

  getProblems(fileUri?: string | undefined): Promise<Problem[]>;

  getBranch(dir: string): Promise<string>;

  getTags(artifactId: string): Promise<IndexTag[]>;

  getRepoName(dir: string): Promise<string | undefined>;

  showToast(
    type: ToastType,
    message: string,
    ...otherParams: any[]
  ): Promise<any>;

  getGitRootPath(dir: string): Promise<string | undefined>;

  listDir(dir: string): Promise<[string, FileType][]>;

  getFileStats(files: string[]): Promise<FileStatsMap>;

  // Secret Storage
  readSecrets(keys: string[]): Promise<Record<string, string>>;

  writeSecrets(secrets: { [key: string]: string }): Promise<void>;

  // LSP
  gotoDefinition(location: Location): Promise<RangeInFile[]>;
  gotoTypeDefinition(location: Location): Promise<RangeInFile[]>; // TODO: add to jetbrains
  getSignatureHelp(location: Location): Promise<SignatureHelp | null>; // TODO: add to jetbrains
  getReferences(location: Location): Promise<RangeInFile[]>;
  getDocumentSymbols(textDocumentIdentifier: string): Promise<DocumentSymbol[]>;

  // Callbacks
  onDidChangeActiveTextEditor(callback: (fileUri: string) => void): void;
}

// Slash Commands

export type TemplateType =
  | "llama2"
  | "alpaca"
  | "zephyr"
  | "phi2"
  | "phind"
  | "anthropic"
  | "chatml"
  | "none"
  | "openchat"
  | "deepseek"
  | "xwin-coder"
  | "neural-chat"
  | "codellama-70b"
  | "llava"
  | "gemma"
  | "granite"
  | "llama3"
  | "codestral";

export interface RequestOptions {
  timeout?: number;
  verifySsl?: boolean;
  caBundlePath?: string | string[];
  proxy?: string;
  headers?: { [key: string]: string };
  extraBodyProperties?: { [key: string]: any };
  noProxy?: string[];
  clientCertificate?: ClientCertificateOptions;
}

export interface CacheBehavior {
  cacheSystemMessage?: boolean;
  cacheConversation?: boolean;
}

export interface ClientCertificateOptions {
  cert: string;
  key: string;
  passphrase?: string;
}

export interface Prediction {
  type: "content";
  content:
    | string
    | {
        type: "text";
        text: string;
      }[];
}

export interface McpToolMeta {
  ui?: {
    resourceUri?: string;
  };
  "ui/resourceUri"?: string;
}

export interface Tool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
    strict?: boolean | null;
  };
  displayTitle: string;
  wouldLikeTo?: string;
  isCurrently?: string;
  hasAlready?: string;
  readonly: boolean;
  isInstant?: boolean;
  uri?: string;
  faviconUrl?: string;
  group: string;
  originalFunctionName?: string;
  systemMessageDescription?: {
    prefix: string;
    exampleArgs?: Array<[string, string | number]>;
  };
  defaultToolPolicy?: ToolPolicy;
  toolCallIcon?: string;
  preprocessArgs?: (
    args: Record<string, unknown>,
    extras: {
      ide: IDE;
    },
  ) => Promise<Record<string, unknown>>;
  evaluateToolCallPolicy?: (
    basePolicy: ToolPolicy,
    parsedArgs: Record<string, unknown>,
    processedArgs?: Record<string, unknown>,
  ) => ToolPolicy;
  mcpMeta?: McpToolMeta;
}

/**
 * Configuration for overriding built-in tool prompts.
 * Extends ToolOverrideConfig with required name for array usage.
 */
export type ToolOverride = ToolOverrideConfig & {
  /** Tool name to override (matches function.name, e.g., "read_file") */
  name: string;
};

interface ToolChoice {
  type: "function";
  function: {
    name: string;
  };
}

export interface BaseCompletionOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  mirostat?: number;
  stop?: string[];
  maxTokens?: number;
  numThreads?: number;
  useMmap?: boolean;
  keepAlive?: number;
  numGpu?: number;
  raw?: boolean;
  stream?: boolean;
  prediction?: Prediction;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  reasoning?: boolean;
  reasoningBudgetTokens?: number;
  promptCaching?: boolean;
}

export interface ModelCapability {
  uploadImage?: boolean;
  tools?: boolean;
  nextEdit?: boolean;
}

export interface ModelDescription {
  title: string;
  provider: string;
  underlyingProviderName: string;
  model: string;
  apiKey?: string;

  apiBase?: string;
  apiKeyLocation?: string;
  envSecretLocations?: Record<string, string>;

  onPremProxyUrl?: string | null;

  contextLength?: number;
  maxStopWords?: number;
  template?: TemplateType;
  completionOptions?: BaseCompletionOptions;
  baseAgentSystemMessage?: string;
  basePlanSystemMessage?: string;
  baseChatSystemMessage?: string;
  requestOptions?: RequestOptions;
  promptTemplates?: { [key: string]: string };
  cacheBehavior?: CacheBehavior;
  capabilities?: ModelCapability;
  roles?: ModelRole[];
  configurationStatus?: LLMConfigurationStatuses;

  sourceFile?: string;
  isFromAutoDetect?: boolean;

  /** Tool overrides for this model */
  toolOverrides?: ToolOverride[];
}

export interface TabAutocompleteOptions {
  disable: boolean;
  maxPromptTokens: number;
  debounceDelay: number;
  modelTimeout: number;
  maxSuffixPercentage: number;
  prefixPercentage: number;
  transform?: boolean;
  template?: string;
  multilineCompletions: "always" | "never" | "auto";
  slidingWindowPrefixPercentage: number;
  slidingWindowSize: number;
  useCache: boolean;
  onlyMyCode: boolean;
  useRecentlyEdited: boolean;
  useRecentlyOpened: boolean;
  disableInFiles?: string[];
  useImports?: boolean;
  showWhateverWeHaveAtXMs?: number;
  // true = enabled, false = disabled, number = enabled with priority
  experimental_includeClipboard: boolean | number;
  experimental_includeRecentlyVisitedRanges: boolean | number;
  experimental_includeRecentlyEditedRanges: boolean | number;
  experimental_enableStaticContextualization: boolean;
}

type BaseInternalMCPOptions = {
  id: string;
  name: string;
  faviconUrl?: string;
  timeout?: number;
  requestOptions?: RequestOptions;
  sourceFile?: string;
};

interface StreamDiffLinesOptionsBase {
  type: StreamDiffLinesType;
  prefix: string;
  highlighted: string;
  suffix: string;
  input: string;
  language: string | undefined;
  modelTitle: string | undefined;
  includeRulesInSystemMessage: boolean;
  fileUri?: string;
}

interface StreamDiffLinesOptionsEdit extends StreamDiffLinesOptionsBase {
  type: "edit";
}

interface StreamDiffLinesOptionsApply extends StreamDiffLinesOptionsBase {
  type: "apply";
  newCode: string;
}

type StreamDiffLinesPayload =
  StreamDiffLinesOptionsApply | StreamDiffLinesOptionsEdit;

export interface RangeInFileWithContents {
  filepath: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  contents: string;
}

/**
 * Signature help represents the signature of something
 * callable. There can be multiple signatures but only one
 * active and only one active parameter.
 */
export class SignatureHelp {
  /**
   * One or more signatures.
   */
  signatures: SignatureInformation[];

  /**
   * The active signature.
   */
  activeSignature: number;

  /**
   * The active parameter of the active signature.
   */
  activeParameter: number;
}

/**
 * Represents the signature of something callable. A signature
 * can have a label, like a function-name, a doc-comment, and
 * a set of parameters.
 */
export class SignatureInformation {
  /**
   * The label of this signature. Will be shown in
   * the UI.
   */
  label: string;

  /**
   * The parameters of this signature.
   */
  parameters: ParameterInformation[];

  /**
   * The index of the active parameter.
   *
   * If provided, this is used in place of {@linkcode SignatureHelp.activeParameter}.
   */
  activeParameter?: number;
}

/**
 * Represents a parameter of a callable-signature. A parameter can
 * have a label and a doc-comment.
 */
export class ParameterInformation {
  /**
   * The label of this signature.
   *
   * Either a string or inclusive start and exclusive end offsets within its containing
   * {@link SignatureInformation.label signature label}. *Note*: A label of type string must be
   * a substring of its containing signature information's {@link SignatureInformation.label label}.
   */
  label: string | [number, number];
}

export interface JSONModelDescription {
  title: string;
  provider: string;
  underlyingProviderName: string;
  model: string;
  apiKey?: string;
  apiBase?: string;

  contextLength?: number;
  maxStopWords?: number;
  template?: TemplateType;
  completionOptions?: BaseCompletionOptions;
  capabilities?: ModelCapability;
  systemMessage?: string;
  requestOptions?: RequestOptions;
  cacheBehavior?: CacheBehavior;

  region?: string;
  profile?: string;
  modelArn?: string;
  apiType?: "openai" | "azure";
  apiVersion?: string;
  deployment?: string;
  projectId?: string;
  accountId?: string;
  aiGatewaySlug?: string;
  useLegacyCompletionsEndpoint?: boolean;
  useResponsesApi?: boolean;
  deploymentId?: string;
  isFromAutoDetect?: boolean;
}

// config.json
export type ConfigMergeType = "merge" | "overwrite";

export interface TerminalOptions {
  reuseTerminal?: boolean;
  terminalName?: string;
  waitForCompletion?: boolean;
}

export interface CompiledMessagesResult {
  compiledChatMessages: ChatMessage[];
  didPrune: boolean;
  contextPercentage: number;
}

interface AddToChatPayloadItem {
  type: "file" | "folder";
  fullPath: string;
  name: string;
}

export interface MessageOption {
  precompiled: boolean;
}

/* LSP-specific interfaces. */

// See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#symbolKind.
// We shift this one index down to match vscode.SymbolKind.
export enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

// See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#symbolTag.
export namespace SymbolTag {
  export const Deprecated: 1 = 1;
}

// See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#symbolTag.
export type SymbolTag = 1;

// See https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#documentSymbol.
export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}
