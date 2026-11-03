import { getSettings, watchSettings, type Settings } from "@/utils/settings";

let current: Settings | undefined;
let ready: Promise<Settings> | undefined;

const load = () => (ready ??= getSettings().then((settings) => (current = settings)));

// called first in main() so listeners registered after it see the cached copy
export function trackSettings() {
  void load();
  watchSettings((settings) => (current = settings));
}

export const currentSettings = async (): Promise<Settings> => current ?? load();

// for listeners that must answer synchronously (blocking webRequest)
export const peekSettings = () => current;
