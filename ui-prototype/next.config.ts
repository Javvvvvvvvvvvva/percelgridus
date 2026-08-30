import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Allow importing the PARCELGRID library from ../../src/lib (outside app dir).
  outputFileTracingRoot: __dirname,
  experimental: { externalDir: true },
  // The library is ESM TypeScript that imports with explicit `.js` specifiers
  // (moduleResolution: bundler). Map those to their real `.ts` sources so the
  // Next bundler can resolve them.
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    // The library (../../src/lib) imports runtime deps like `decimal.js`. Those
    // files live outside this app, so webpack would only find such deps in the
    // repo ROOT node_modules (i.e. a root install is required). Adding this
    // app's own node_modules as an absolute resolve root makes the library's
    // deps resolve from `ui-prototype/node_modules` too — so a fresh clone works
    // with just `cd ui-prototype && npm install && npm run dev`, no root install.
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      "node_modules",
    ];
    return config;
  },
};

export default nextConfig;
