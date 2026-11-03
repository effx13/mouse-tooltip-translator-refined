// the folder name under src/translators/ (checked by catalog.test.ts)
export type EngineId = string;

export interface EngineEntry {
  id: EngineId;
  enabled: boolean;
}

export type EngineFieldValues = Record<string, string>;
export type EngineConfig = Partial<Record<EngineId, EngineFieldValues>>;

export type EngineFieldType = "text" | "password" | "url" | "select" | "llmModel";

export interface EngineField {
  key: string;
  i18nKey: string;
  type: EngineFieldType;
  // setup "required": the engine is skipped without it; setup "optional": needed to switch to the official API
  required?: boolean;
  placeholder?: string;
  // select fields: label -> value
  options?: Record<string, string>;
  default?: string;
  readonlyWhen?: (values: EngineFieldValues) => boolean;
}

export type EngineSetup = "none" | "optional" | "required";

// a simple-icons path (24x24) in the brand color, a bundled SVG file, or a letter tile
export type EngineIcon =
  | { kind: "path"; path: string; hex: string }
  | { kind: "image"; src: string }
  | { kind: "mark"; mark: string; color: string; textColor?: string };

export const simpleIcon = ({ path, hex }: { path: string; hex: string }): EngineIcon => ({
  kind: "path",
  path,
  hex: `#${hex}`,
});

export interface EngineInfo {
  id: EngineId;
  // position in the default list
  order: number;
  defaultEnabled?: boolean;
  // brand name shown as-is; i18nKey replaces it for generic names
  label: string;
  i18nKey?: string;
  icon: EngineIcon;
  experimental?: boolean;
  setup: EngineSetup;
  fields: readonly EngineField[];
  // where the user gets a key or sets up a server
  docsUrl?: string;
}

export const defineEngineMeta = (info: EngineInfo): EngineInfo => info;

export const apiKeyField = (required: boolean, placeholder?: string): EngineField => ({
  key: "apiKey",
  i18nKey: "API_Key",
  type: "password",
  required,
  placeholder,
});
