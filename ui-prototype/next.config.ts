import type { NextConfig } from "next";

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
    return config;
  },
};

export default nextConfig;
