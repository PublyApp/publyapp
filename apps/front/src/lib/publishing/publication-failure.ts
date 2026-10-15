/**
 * Failure taxonomy for Failed / Paused publications (#647): every such row
 * carries exactly one category and therefore exactly one primary action.
 * The API stamps the category; rows from before categories existed arrive
 * with a null/unknown value and fall back per status.
 */
const PUBLICATION_FAILURE_CATEGORIES = [
	'reconnect',
	'fix_content',
	'retry_later',
	'unknown',
	'needs_review',
] as const;

type PublicationFailureCategory =
	(typeof PUBLICATION_FAILURE_CATEGORIES)[number];

type PublicationFailureAction = 'reconnect' | 'edit' | 'retry' | 'review';

export type PublicationFailurePresentation = {
	tone: 'danger' | 'info' | 'neutral' | 'primary' | 'success' | 'warning';
	pillKey: string;
	/** Generic sentence shown when the stored cause is blank (#2013). */
	messageKey: string;
	primaryAction: PublicationFailureAction;
};

const FAILURE_PRESENTATION = {
	reconnect: {
		tone: 'warning',
		pillKey: 'posts:publication-category-reconnect',
		messageKey: 'posts:publication-category-message-reconnect',
		primaryAction: 'reconnect',
	},
	fix_content: {
		tone: 'danger',
		pillKey: 'posts:publication-category-fix-content',
		messageKey: 'posts:publication-category-message-fix-content',
		primaryAction: 'edit',
	},
	retry_later: {
		tone: 'warning',
		pillKey: 'posts:publication-category-retry-later',
		messageKey: 'posts:publication-category-message-retry-later',
		primaryAction: 'retry',
	},
	unknown: {
		tone: 'neutral',
		pillKey: 'posts:publication-category-unknown',
		messageKey: 'posts:publication-category-message-unknown',
		primaryAction: 'retry',
	},
	// #2176: an ambiguous write could not be ruled in or out. The user checks the
	// provider profile, then marks the post published (primary) or retries.
	needs_review: {
		tone: 'warning',
		pillKey: 'posts:publication-category-needs-review',
		messageKey: 'posts:publication-category-message-needs-review',
		primaryAction: 'review',
	},
} satisfies Record<PublicationFailureCategory, PublicationFailurePresentation>;

const isFailureCategory = (
	value: string,
): value is PublicationFailureCategory =>
	(PUBLICATION_FAILURE_CATEGORIES as readonly string[]).includes(value);

/** Presentation for a Failed/Paused row; null for every other status. */
const baseFailurePresentation = (
	status: string,
	category: string | null,
): PublicationFailurePresentation => {
	if (category !== null && isFailureCategory(category)) {
		return FAILURE_PRESENTATION[category];
	}
	if (status === 'paused') {
		return FAILURE_PRESENTATION.reconnect;
	}
	return FAILURE_PRESENTATION.unknown;
};

/** An account that is not Active cannot publish, so a "Retry now" primary
 * action would only pause the row again: offer the reconnect action instead. */
export const publicationFailurePresentation = (
	status: string | null,
	category: string | null,
	accountUsable: boolean,
): PublicationFailurePresentation | null => {
	if (status !== 'failed' && status !== 'paused') {
		return null;
	}
	const base = baseFailurePresentation(status, category);
	if (base.primaryAction === 'retry' && !accountUsable) {
		return { ...base, primaryAction: 'reconnect' };
	}
	return base;
};

export type RetryAvailability =
	| { enabled: true }
	| { enabled: false; reasonKey: string };

/** Mirrors the API rules: only Failed/Paused rows retry, the account must be
 * Active, only the newest publication of a post+account pair retries, and the
 * caller needs publish rights. */
export const retryAvailability = ({
	status,
	accountUsable,
	superseded,
	canPublish,
}: {
	status: string | null;
	accountUsable: boolean;
	superseded: boolean;
	canPublish: boolean;
}): RetryAvailability => {
	if (status !== 'failed' && status !== 'paused') {
		return {
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-status',
		};
	}
	if (!canPublish) {
		return {
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-permission',
		};
	}
	if (!accountUsable) {
		return {
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-reconnect',
		};
	}
	if (superseded) {
		return {
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-superseded',
		};
	}
	return { enabled: true };
};
