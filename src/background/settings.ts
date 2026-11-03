import { getSettings, watchSettings, type Settings } from "@/utils/settings";

let current: Settings | undefined;
const ready = getSettings().then((settings) => (current = settings));
watchSettings((settings) => (current = settings));

export const currentSettings = async (): Promise<Settings> => current ?? ready;

// for listeners that must answer synchronously (blocking webRequest)
export const peekSettings = () => current;
