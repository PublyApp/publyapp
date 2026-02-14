/**
 * Type declaration for React Router's virtual server-build module.
 * Kept in a .d.ts so tsconfig.paths.json is not used for this (avoids
 * vite-tsconfig-paths resolving it; the React Router Vite plugin provides the module).
 */
declare module 'virtual:react-router/server-build' {
	export * from '../.react-router/types/+server-build';
}
