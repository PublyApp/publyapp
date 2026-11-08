// ponytail: Expo's Metro config loader is only proven with a CommonJS
// metro.config.js (NativeWind's withNativeWind is itself CJS). This is tool
// configuration, not application code — the TS-only repo rule covers programs.
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo's getDefaultConfig already detects the pnpm workspace (watchFolders +
// nodeModulesPaths) since SDK 52 — see docs/guides/monorepos.md. Do not
// re-declare them here; that is the documented way to break the monorepo setup.
const config = getDefaultConfig(__dirname);

// NativeWind resolves `input` and `configPath` against process.cwd(), which is
// the repo root when a tool (knip) loads this config from outside apps/mobile.
// Absolute paths keep it correct from either cwd.
module.exports = withNativeWind(config, {
	input: path.join(__dirname, 'global.css'),
	configPath: path.join(__dirname, 'tailwind.config'),
	// apps/mobile/tsconfig.json already includes nativewind-env.d.ts; skip
	// NativeWind rewriting the tsconfig on every start.
	disableTypeScriptGeneration: true,
});
