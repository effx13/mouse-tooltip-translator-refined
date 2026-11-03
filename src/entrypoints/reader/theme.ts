export type EbookTheme = "auto" | "light" | "dark";

// --theme-bg-color is read by foliate's paginator to paint the page margins
const THEMES: Record<EbookTheme, string> = {
  light: `
    html { color-scheme: light !important; --theme-bg-color: #ffffff; }
    html, body { background: #ffffff !important; color: #111111 !important; }
  `,
  dark: `
    html { color-scheme: dark !important; --theme-bg-color: #1b1b1b; }
    html, body { background: #1b1b1b !important; color: #d6d6d6 !important; }
    a:link { color: lightblue; }
  `,
  auto: `
    html { color-scheme: light dark; }
    @media (prefers-color-scheme: dark) {
      a:link { color: lightblue; }
    }
  `,
};

const BASE = `
  @namespace epub "http://www.idpf.org/2007/ops";
  p, li, blockquote, dd {
    line-height: 1.4;
    text-align: justify;
    hyphens: auto;
    -webkit-hyphenate-limit-before: 3;
    -webkit-hyphenate-limit-after: 2;
    -webkit-hyphenate-limit-lines: 2;
    hanging-punctuation: allow-end last;
    widows: 2;
  }
  [align="left"] { text-align: left; }
  [align="right"] { text-align: right; }
  [align="center"] { text-align: center; }
  [align="justify"] { text-align: justify; }
  pre { white-space: pre-wrap !important; }
  aside[epub|type~="endnote"],
  aside[epub|type~="footnote"],
  aside[epub|type~="note"],
  aside[epub|type~="rearnote"] {
    display: none;
  }
`;

export const isEbookTheme = (value: unknown): value is EbookTheme =>
  typeof value === "string" && value in THEMES;

// @namespace must precede every other rule in the sheet
export const bookCss = (theme: EbookTheme) => BASE + THEMES[theme];
