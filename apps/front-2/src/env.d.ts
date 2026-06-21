// Runtime public-env contract for the browser.
export type RuntimePublicEnv = {
	PUBLIC_API_BASE_URL?: string;
};

declare global {
	interface Window {
		__ENV__?: RuntimePublicEnv;
	}
}
