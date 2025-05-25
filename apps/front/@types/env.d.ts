/// <reference types="vite/client" />

/// <reference types="@org/shared/@types/index" />

// https://github.com/oven-sh/bun/issues/9949#issuecomment-2124041655
declare module 'react-dom/server.browser' {
	export * from 'react-dom/server';
}
