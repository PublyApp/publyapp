/**
 * Type declaration for React Router's virtual server-build module.
 *
 * The React Router Vite plugin provides this module at runtime. The CLI runs
 * `react-router typegen` before `tsc`, but TypeScript doesn't reliably include
 * declarations under dot-folders (like `.react-router/`) during editor/CLI
 * type-checking, so we keep a stable declaration here.
 */
declare module 'virtual:react-router/server-build' {
	import type { ServerBuild } from 'react-router';

	export const assets: ServerBuild['assets'];
	export const assetsBuildDirectory: ServerBuild['assetsBuildDirectory'];
	export const basename: ServerBuild['basename'];
	export const entry: ServerBuild['entry'];
	export const future: ServerBuild['future'];
	export const isSpaMode: ServerBuild['isSpaMode'];
	export const prerender: ServerBuild['prerender'];
	export const publicPath: ServerBuild['publicPath'];
	export const routeDiscovery: ServerBuild['routeDiscovery'];
	export const routes: ServerBuild['routes'];
	export const ssr: ServerBuild['ssr'];
	export const unstable_getCriticalCss: ServerBuild['unstable_getCriticalCss'];
}
