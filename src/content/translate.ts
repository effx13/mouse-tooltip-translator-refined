import { sendMessage, type TranslateRequest, type TranslateResult } from "@/utils/messaging";

export async function requestTranslate(req: TranslateRequest): Promise<TranslateResult | null> {
  try {
    return await sendMessage("translate", req);
  } catch (error) {
    console.log(error);
    return null;
  }
}

export function reportTooltipShown(sourceText: string, targetText: string) {
  sendMessage("tooltipShown", { sourceText, targetText }).catch(() => {});
}
