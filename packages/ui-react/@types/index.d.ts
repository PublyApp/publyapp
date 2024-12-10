/// <reference types="@emotion/react/types/css-prop" />
/// <reference types="vite-plugin-svgr/client" />

// for fixing date-fns directory import
declare module 'date-fns/locale/index.js' {
	export * from 'date-fns/locale';
}
