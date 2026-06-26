// Reserved runtime public-env injection contract for later migration.
export type RuntimePublicEnv = {
	PUBLIC_API_BASE_URL?: string;
};

declare global {
	interface Window {
		__ENV__?: RuntimePublicEnv;
	}
}
