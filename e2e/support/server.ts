import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { articleHtml, buildEpub, buildPdf, fakeTranslate } from "./content.ts";

export interface FixtureServer {
  origin: string;
  llmEndpoint: string;
  // source texts the fake LLM was asked to translate, in order
  translated: string[];
  close: () => Promise<void>;
}

interface ChatRequest {
  messages?: { role: string; content: string }[];
}

async function readJson(req: IncomingMessage): Promise<ChatRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(res: ServerResponse, status: number, type: string, body: string | Buffer) {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

// the localLlm engine wraps the source as "<instruction>\n<text>\n...\n</text>"
const sourceText = (body: ChatRequest) =>
  /<text>\n([\s\S]*)\n<\/text>/.exec(body.messages?.at(-1)?.content ?? "")?.[1] ?? "";

export async function startFixtureServer(): Promise<FixtureServer> {
  const translated: string[] = [];
  const pdf = buildPdf();
  const epub = buildEpub();

  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "OPTIONS") return send(res, 204, "text/plain", "");
    if (req.method === "GET" && pathname === "/v1/models") {
      return send(res, 200, "application/json", JSON.stringify({ data: [{ id: "test" }] }));
    }
    if (req.method === "POST" && pathname === "/v1/chat/completions") {
      const text = sourceText(await readJson(req));
      translated.push(text);
      const content = `en\t${fakeTranslate(text)}`;
      return send(
        res,
        200,
        "application/json",
        JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
      );
    }
    if (pathname === "/" || pathname === "/article.html") {
      return send(res, 200, "text/html; charset=utf-8", articleHtml());
    }
    if (pathname === "/sample.pdf") return send(res, 200, "application/pdf", pdf);
    if (pathname === "/sample.epub") return send(res, 200, "application/epub+zip", epub);
    return send(res, 404, "text/plain", "not found");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server has no port");
  const { port } = address;
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    llmEndpoint: `${origin}/v1`,
    translated,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

// settings that route every translation to the fake server
export const offlineSettings = (server: FixtureServer, patch: Record<string, unknown> = {}) => ({
  translatorVendor: "localLlm",
  llmProvider: "custom",
  llmApiEndpoint: server.llmEndpoint,
  llmModel: "test",
  translateSource: "auto",
  translateTarget: "ko",
  fallbackTranslatorEngine: false,
  tooltipWordDictionary: false,
  detectPDF: false,
  ...patch,
});
