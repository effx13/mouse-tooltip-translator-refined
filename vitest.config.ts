import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

const SRC = new URL("./src/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");

export default defineConfig({
  plugins: [WxtVitest()],
  resolve: {
    alias: [{ find: /^\/src\//, replacement: SRC }],
  },
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.{js,ts}"],
  },
});
