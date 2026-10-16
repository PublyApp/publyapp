/**
 * Mints a per-request CSP nonce (128 random bits, base64url). Uses Web Crypto
 * so the same module is safe to import from the router, which is bundled for
 * both the server and the client.
 */
export const mintCspNonce = (): string => {
	const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
};
