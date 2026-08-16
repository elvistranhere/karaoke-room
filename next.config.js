/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

// Changing the registered script URL is what makes a browser fetch a new service
// worker, and the version also names the cache, so every deploy busts the shell.
const swVersion =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? Date.now().toString(36);

/** @type {import("next").NextConfig} */
const config = {
  env: {
    NEXT_PUBLIC_SW_VERSION: swVersion,
  },
};

export default config;
