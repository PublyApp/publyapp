/// <reference types="@emotion/react/types/css-prop" />
/// <reference types="vite-plugin-svgr/client" />

/// <reference types="./@tanstack__react-table" />

// for fixing date-fns directory import
declare module 'date-fns/locale/index.js' {
	export * from 'date-fns/locale';
}
