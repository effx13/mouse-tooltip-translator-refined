import { crc32 } from "node:zlib";

export const ARTICLE_TITLE = "The Quiet Return of the Night Train";

export const ARTICLE_PARAGRAPHS = [
  "Across Europe, overnight trains are making a quiet comeback. Travelers who once chose short flights are rediscovering the pleasure of falling asleep in one city and waking up in another.",
  "Rail operators say demand has grown faster than they can add new carriages. On popular routes, sleeper cabins now sell out weeks in advance, especially during the summer and around public holidays.",
  "For many passengers, the appeal is simple: a bed, a window, and no airport security lines. The journey becomes part of the trip rather than an obstacle to it.",
];

export const PULL_QUOTE = "The journey becomes part of the trip.";

export const PDF_LINES = [
  "Mouse Tooltip Translator works in PDF files too.",
  "Hover over any sentence to see its translation.",
  "Select a phrase to translate exactly what you need.",
];

export const EPUB_TITLE = "A Short Guide to Slow Travel";

export const EPUB_PARAGRAPHS = [
  "Slow travel is less about distance and more about attention.",
  "Instead of collecting destinations, you spend longer in fewer places and let each one reveal itself.",
];

// what the fake LLM answers; keys are compared after whitespace is collapsed
export const TRANSLATIONS: Readonly<Record<string, string>> = {
  [ARTICLE_TITLE]: "야간열차의 조용한 귀환",
  "Across Europe, overnight trains are making a quiet comeback.":
    "유럽 전역에서 야간열차가 조용히 돌아오고 있다.",
  "Travelers who once chose short flights are rediscovering the pleasure of falling asleep in one city and waking up in another.":
    "한때 단거리 비행을 택하던 여행자들이 한 도시에서 잠들어 다른 도시에서 깨어나는 즐거움을 다시 발견하고 있다.",
  "Rail operators say demand has grown faster than they can add new carriages.":
    "철도 운영사들은 새 객차를 늘리는 속도보다 수요가 더 빠르게 늘었다고 말한다.",
  "On popular routes, sleeper cabins now sell out weeks in advance, especially during the summer and around public holidays.":
    "인기 노선에서는 침대칸이 이제 몇 주 전에 매진되며, 특히 여름과 공휴일 전후에 그렇다.",
  "For many passengers, the appeal is simple: a bed, a window, and no airport security lines.":
    "많은 승객에게 매력은 단순하다. 침대와 창문, 그리고 공항 보안 검색 줄이 없다는 것이다.",
  "The journey becomes part of the trip rather than an obstacle to it.":
    "이동은 여행의 걸림돌이 아니라 여행의 일부가 된다.",
  [PULL_QUOTE]: "이동이 곧 여행의 일부가 된다.",
  "Mouse Tooltip Translator works in PDF files too.":
    "마우스 툴팁 번역기는 PDF 파일에서도 작동합니다.",
  "Hover over any sentence to see its translation.":
    "아무 문장에나 마우스를 올리면 번역이 보입니다.",
  "Select a phrase to translate exactly what you need.":
    "필요한 부분만 정확히 번역하려면 구절을 선택하세요.",
  "Slow travel is less about distance and more about attention.":
    "느린 여행은 거리보다 주의를 기울이는 것에 관한 것이다.",
};

export const FALLBACK_PREFIX = "[ko] ";

export function fakeTranslate(text: string): string {
  const key = text.replace(/\s+/g, " ").trim();
  return TRANSLATIONS[key] ?? `${FALLBACK_PREFIX}${key}`;
}

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function articleHtml(): string {
  const paragraphs = ARTICLE_PARAGRAPHS.map((p) => `<p>${escapeHtml(p)}</p>`);
  paragraphs.splice(2, 0, `<blockquote id="quote">${escapeHtml(PULL_QUOTE)}</blockquote>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(ARTICLE_TITLE)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #f6f4ef; color: #1f2328; font: 19px/1.7 Georgia, "Times New Roman", serif; }
  header.site { border-bottom: 1px solid #e2ddd2; background: #fff; }
  header.site div { max-width: 720px; margin: 0 auto; padding: 14px 24px; font: 600 15px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #6b5f4b; }
  article { max-width: 720px; margin: 0 auto; padding: 48px 24px 96px; }
  .kicker { font: 600 13px/1 system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; color: #a0522d; }
  h1 { font-size: 44px; line-height: 1.15; margin: 14px 0 12px; }
  .byline { font: 14px/1.4 system-ui, sans-serif; color: #6e6a62; margin-bottom: 36px; }
  p { margin: 0 0 24px; }
  blockquote { margin: 32px 0; padding: 4px 0 4px 24px; border-left: 4px solid #a0522d; font-size: 26px; line-height: 1.4; font-style: italic; color: #3a3530; }
  textarea { width: 100%; box-sizing: border-box; font: 17px/1.5 system-ui, sans-serif; padding: 12px; border: 1px solid #d6d0c4; border-radius: 8px; }
</style>
</head>
<body>
<header class="site"><div>The Weekly Journal</div></header>
<article>
<div class="kicker">Travel</div>
<h1 id="title">${escapeHtml(ARTICLE_TITLE)}</h1>
<div class="byline">By Clara Jensen · 6 min read</div>
${paragraphs.join("\n")}
<textarea id="writing" rows="3" aria-label="Comment"></textarea>
</article>
</body>
</html>`;
}

const escapePdf = (text: string) => text.replace(/[\\()]/g, "\\$&");

// a one-page PDF using the standard Helvetica font, so pdf.js renders a real text layer
export function buildPdf(lines: readonly string[] = PDF_LINES): Buffer {
  const stream = [
    "BT",
    "/F1 22 Tf",
    "72 700 Td",
    "30 TL",
    ...lines.flatMap((line, i) =>
      i === 0 ? [`(${escapePdf(line)}) Tj`] : ["T*", `(${escapePdf(line)}) Tj`],
    ),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

// a stored (uncompressed) zip is enough for an EPUB and keeps `mimetype` first as the spec requires
function buildZip(files: readonly { name: string; data: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centrals.reduce((sum, buf) => sum + buf.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export function buildEpub(): Buffer {
  const chapter = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en"><head><title>Chapter 1</title></head>
<body><h1>Chapter 1: Arriving Slowly</h1>${EPUB_PARAGRAPHS.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</body></html>`;
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Chapter 1: Arriving Slowly</a></li></ol></nav></body></html>`;
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">urn:uuid:9b1c7c52-6a7e-4b52-9a3e-0e7f1a2b3c4d</dc:identifier>
<dc:title>${escapeHtml(EPUB_TITLE)}</dc:title><dc:language>en</dc:language>
<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine><itemref idref="c1"/></spine>
</package>`;
  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
  return buildZip([
    { name: "mimetype", data: "application/epub+zip" },
    { name: "META-INF/container.xml", data: container },
    { name: "OEBPS/content.opf", data: opf },
    { name: "OEBPS/nav.xhtml", data: nav },
    { name: "OEBPS/chapter1.xhtml", data: chapter },
  ]);
}
