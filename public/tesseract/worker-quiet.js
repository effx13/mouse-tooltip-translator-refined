// Tesseract worker wrapper.
//
// The traineddata files carry config for the legacy engine, which the
// LSTM-only core does not have, so every worker start prints a burst of
// harmless "Warning: Parameter not found: ..." lines through console.warn
// (Emscripten printErr). Those flood chrome://extensions errors. Drop just
// that message and load the real worker.
const warn = console.warn.bind(console);
console.warn = (...args) => {
  if (typeof args[0] === "string" && args[0].startsWith("Warning: Parameter not found:")) {
    return;
  }
  warn(...args);
};
importScripts("worker.min.js");
