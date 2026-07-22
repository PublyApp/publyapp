import type { RuntimePublicEnv } from './lib/env';

declare global {
	interface Window {
		__ENV__?: RuntimePublicEnv;
	}
}
