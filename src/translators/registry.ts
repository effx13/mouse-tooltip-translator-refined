import baidu from "./baidu";
import bing from "./bing";
import browserAPI from "./browserAPI";
import deepl from "./deepl";
import type { Engine } from "./engine";
import google from "./google";
import googleGTX from "./googleGTX";
import googleV2 from "./googleV2";
import googleWeb from "./googleWeb";
import googleWebImage from "./googleWebImage";
import localLlm from "./localLlm";
import papago from "./papago";
import yandex from "./yandex";

export const engines = {
  google,
  googleWeb,
  googleV2,
  googleGTX,
  googleWebImage,
  bing,
  papago,
  deepl,
  yandex,
  baidu,
  browserAPI,
  localLlm,
} satisfies Record<string, Engine>;

export type EngineName = keyof typeof engines;

export function getEngine(name: string): Engine | undefined {
  return Object.hasOwn(engines, name) ? (engines as Record<string, Engine>)[name] : undefined;
}
