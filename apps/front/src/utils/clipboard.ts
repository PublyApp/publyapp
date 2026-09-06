export type CopyToClipboardResult =
	| { ok: true }
	| { ok: false; reason: 'unavailable' }
	| { ok: false; reason: 'failed'; error: unknown };

export const isClipboardAvailable = (): boolean => {
	if (typeof navigator === 'undefined') {
		return false;
	}

	const clipboard = navigator.clipboard;
	return typeof clipboard?.writeText === 'function';
};

/** Writes text through the browser Clipboard API without touching browser globals during SSR. */
export const copyToClipboard = async (
	value: string,
): Promise<CopyToClipboardResult> => {
	if (!isClipboardAvailable()) {
		return { ok: false, reason: 'unavailable' };
	}

	try {
		await navigator.clipboard.writeText(value);
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: 'failed', error };
	}
};
