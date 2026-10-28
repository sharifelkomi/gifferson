import vinext from "vinext";
import { defineConfig } from "vite";

const localBindingConfig = {
  name: "gifferson",
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  routes: [
    { pattern: "gifferson.com", custom_domain: true },
    { pattern: "www.gifferson.com", custom_domain: true },
  ],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    optimizeDeps: {
      exclude: ["gifski-wasm"],
    },
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
