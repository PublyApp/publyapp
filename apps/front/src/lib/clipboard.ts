// Copy a string to the system clipboard. Returns true on success.
//
// Uses the modern `navigator.clipboard.writeText` API when available; falls
// back to a `window.prompt` (which lets the user manually copy from the
// dialog) on older browsers and SSR-safe in case `navigator` / `window` are
// undefined. Returns false only when neither path is reachable (server-side
// render path with no fallback).
type CopyToClipboardOptions = {
	promptLabel?: string;
};

export const copyToClipboard = async (
	text: string,
	options: CopyToClipboardOptions = {},
): Promise<boolean> => {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall through to prompt fallback
		}
	}

	if (typeof window !== 'undefined') {
		// Treat showing the manual-copy prompt as success;
		// browsers do not tell us whether the user copied from it.
		window.prompt(options.promptLabel ?? 'Copy to clipboard', text);
		return true;
	}

	return false;
};
