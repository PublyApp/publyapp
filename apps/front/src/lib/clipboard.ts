// Copy a string to the system clipboard. Returns true on success.
//
// Uses the modern `navigator.clipboard.writeText` API when available; falls
// back to a `window.prompt` (which lets the user manually copy from the
// dialog) on older browsers and SSR-safe in case `navigator` / `window` are
// undefined. Returns false only when neither path is reachable (server-side
// render path with no fallback).
export const copyToClipboard = async (text: string): Promise<boolean> => {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall through to prompt fallback
		}
	}

	if (typeof window !== 'undefined') {
		window.prompt('Copy this URL', text);
		return true;
	}

	return false;
};
