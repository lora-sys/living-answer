import { defineConfig, lazyPlugins } from "vite-plus";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";

const config = defineConfig({
  publicDir: "public",
  fmt: {
    ignorePatterns: ["src/routeTree.gen.ts"],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: { tsconfigPaths: true },
  plugins: lazyPlugins(() => [tanstackStart(), viteReact(), tailwindcss()]),
});

export default config;
