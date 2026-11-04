import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const clean = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * The folded « Détails techniques » body for an error (ShopKart OS shape):
 * the raw cause the user can hand to support — HTTP status, the problem's
 * `title`/`detail`, its translation key and the API `traceId` request id.
 * Never rendered as the human sentence (owner decision 04/11).
 */
export const errorDetailsText = (error: unknown): string => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem' || failure.kind === 'validation') {
		const lines = [`HTTP ${failure.status}`];
		const title = clean(failure.title);
		if (title) {
			lines.push(title);
		}
		const detail = clean(failure.detail);
		if (detail) {
			lines.push(detail);
		}
		const translationKey = clean(failure.translationKey);
		if (translationKey) {
			lines.push(`translationKey: ${translationKey}`);
		}
		const traceId =
			clean(failure.extensions?.traceId) ??
			clean((error as { traceId?: unknown } | null)?.traceId);
		if (traceId) {
			lines.push(`traceId: ${traceId}`);
		}
		return lines.join('\n');
	}

	if (failure.kind === 'network') {
		return `network: ${failure.message}`;
	}

	if (failure.kind === 'abort') {
		return 'aborted';
	}

	return failure.kind === 'unknown' ? failure.message : String(error);
};
