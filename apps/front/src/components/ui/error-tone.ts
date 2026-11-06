import type { ErrorKind } from '~/lib/error-kind';

export type ErrorTone = 'info' | 'neutral' | 'warning' | 'danger';

/**
 * The pictogram tone per error kind, exactly ShopKart OS's mapping: offline is
 * info, not-found neutral, forbidden warning, server/unknown danger.
 */
export const errorToneFromKind = (kind: ErrorKind): ErrorTone => {
	switch (kind) {
		case 'offline':
			return 'info';
		case 'not_found':
			return 'neutral';
		case 'forbidden':
			return 'warning';
		case 'server':
		case 'unknown':
		case 'signed_out':
			return 'danger';
	}
};

/**
 * Legacy status-code tone, kept for call sites that only have a translated
 * eyebrow. New code classifies the real error (`classifyError`).
 */
export const errorToneFromCode = (code?: string): ErrorTone => {
	if (!code) {
		return 'danger';
	}
	if (/\b404\b/.test(code)) {
		return 'neutral';
	}
	if (/\b(?:401|403)\b/.test(code)) {
		return 'warning';
	}
	return 'danger';
};
