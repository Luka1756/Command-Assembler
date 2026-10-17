/** Minecraft version profiles the generator can target. Only verified profiles are listed. */
export type VersionId = '26.3+' | '26.4-snapshot-4';

/** Stable release or development snapshot. */
export type VersionChannel = 'release' | 'snapshot';

export interface BuildSettings {
  version: VersionId;
  /** Blocks above the player where the falling block is summoned. */
  spawnHeight: number;
  /** Append commands that remove the temporary rail and minecarts. */
  selfCleaning: boolean;
}

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** 1-based script line, when the diagnostic belongs to one. */
  line?: number;
}

export interface ScriptCommand {
  /** 1-based line in the script the command came from. */
  line: number;
  text: string;
}

export interface ParsedScript {
  commands: ScriptCommand[];
  diagnostics: Diagnostic[];
}

export type PartKind = 'rail' | 'command' | 'cleanup' | 'chain_block';

/** One element of the generated machine (a passenger inside the summon). */
export interface MachinePart {
  kind: PartKind;
  snbt: string;
}

export interface GenerateResult {
  /** The summon command. Empty when generation failed validation. */
  output: string;
  /** True when the output is valid and safe to copy. */
  ok: boolean;
  diagnostics: Diagnostic[];
  commandCount: number;
  /** Total characters across the parsed commands (no newlines, comments or blank lines). */
  commandChars: number;
  outputLength: number;
  /** Chain command blocks in the generated structure. */
  chainBlocks: number;
  /** The version profile used, or null when none could be selected. */
  profileId: VersionId | null;
}

/** A command value read from a Command field. Text is exactly as decoded, never trimmed or reformatted. */
export interface ReadCommand {
  text: string;
  /** 1-based line of the field in the pasted text. */
  line: number;
}

/** A skipped entry or a warning from the Command Reader. */
export interface ReadIssue {
  line: number;
  message: string;
}

export interface ReadResult {
  commands: ReadCommand[];
  /** Command fields that were found but not imported, with the reason. */
  skipped: ReadIssue[];
  warnings: ReadIssue[];
  /** Set when the input could not be read at all (empty or too large). */
  error: string | null;
}

export interface AppState {
  script: string;
  settings: BuildSettings;
}

export interface Creation {
  id: string;
  name: string;
  script: string;
  settings: BuildSettings;
  savedAt: number;
}

export interface Example {
  id: string;
  title: string;
  category: string;
  description: string;
  script: string;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };
