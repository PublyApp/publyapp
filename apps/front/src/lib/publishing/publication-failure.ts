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
] as const;

type PublicationFailureCategory =
	(typeof PUBLICATION_FAILURE_CATEGORIES)[number];

type PublicationFailureAction = 'reconnect' | 'edit' | 'retry';

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
} satisfies Record<PublicationFailureCategory, PublicationFailurePresentation>;

const isFailureCategory = (
	value: string,
): value is PublicationFailureCategory =>
	(PUBLICATION_FAILURE_CATEGORIES as readonly string[]).includes(value);

/** Presentation for a Failed/Paused row; null for every other status. */
export const publicationFailurePresentation = (
	status: string | null,
	category: string | null,
): PublicationFailurePresentation | null => {
	if (status !== 'failed' && status !== 'paused') {
		return null;
	}
	if (category !== null && isFailureCategory(category)) {
		return FAILURE_PRESENTATION[category];
	}
	if (status === 'paused') {
		return FAILURE_PRESENTATION.reconnect;
	}
	return FAILURE_PRESENTATION.unknown;
};

export type RetryAvailability =
	| { enabled: true }
	| { enabled: false; reasonKey: string };

/** Mirrors the API rules: only Failed/Paused rows retry, a Paused row waits
 * for its account to be reconnected, and the caller needs publish rights. */
export const retryAvailability = ({
	status,
	accountNeedsReconnect,
	canPublish,
}: {
	status: string | null;
	accountNeedsReconnect: boolean;
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
	if (status === 'paused' && accountNeedsReconnect) {
		return {
			enabled: false,
			reasonKey: 'posts:publication-retry-disabled-reconnect',
		};
	}
	return { enabled: true };
};
