// Runtime public-env contract for the browser Kiota client (Architecture gate / R3-B1).
//
// `__root.tsx` injects a nonce-bearing inline script that sets `window.__ENV__` so the
// browser client reads the PUBLIC API base at RUNTIME (one image, many environments) —
// NOT build-time `import.meta.env`.
export type RuntimePublicEnv = {
	PUBLIC_API_BASE_URL?: string;
};

declare global {
	interface Window {
		__ENV__?: RuntimePublicEnv;
	}
}

export {};
