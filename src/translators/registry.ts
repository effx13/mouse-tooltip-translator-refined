import type { Engine } from "./engine";

// one folder per engine; its index.ts is the request implementation (background only)
const modules = import.meta.glob<Engine>("./*/index.ts", { eager: true, import: "default" });

const folderId = (path: string) => path.split("/")[1] ?? path;

export const engines: Readonly<Record<string, Engine>> = Object.fromEntries(
  Object.entries(modules).map(([path, engine]) => [folderId(path), engine]),
);

const engineByName: ReadonlyMap<string, Engine> = new Map(Object.entries(engines));

export function getEngine(name: string): Engine | undefined {
  return engineByName.get(name);
}
