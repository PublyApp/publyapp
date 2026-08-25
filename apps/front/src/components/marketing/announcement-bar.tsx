import { IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

import { MarketingContainer } from './marketing-container';

/**
 * Announcement bar (#1038).
 *
 * One 40px row at >=1024, one or two lines between 768 and 1023, and it wraps
 * to two lines below 768 — it NEVER truncates, because a half-shown
 * announcement is worse than none. The dismiss control stays at the trailing
 * edge at every width.
 *
 * Dismissal is keyed by `id`: changing the announcement's id re-shows it,
 * so a new announcement is never swallowed by an old dismissal.
 */

const ANNOUNCEMENT_DISMISSED_STORAGE_KEY_PREFIX =
	'publyapp:announcement-dismissed:';

/**
 * The announcement currently on air. Copy lives in the locale bundles; only
 * the identity and tone live here.
 */
const CURRENT_MARKETING_ANNOUNCEMENT = {
	id: 'french-parity-2026-07',
	messageKey: 'marketing-announcement-french-parity',
	tone: 'muted',
} as const;

type AnnouncementTone = 'muted' | 'promo';

const readDismissed = (id: string): boolean => {
	if (typeof window === 'undefined') {
		return false;
	}

	try {
		return (
			window.localStorage.getItem(
				`${ANNOUNCEMENT_DISMISSED_STORAGE_KEY_PREFIX}${id}`,
			) === 'true'
		);
	} catch {
		return false;
	}
};

const writeDismissed = (id: string) => {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		window.localStorage.setItem(
			`${ANNOUNCEMENT_DISMISSED_STORAGE_KEY_PREFIX}${id}`,
			'true',
		);
	} catch {
		// Unavailable storage only costs the visitor a repeat announcement.
	}
};

export const AnnouncementBar = ({
	id = CURRENT_MARKETING_ANNOUNCEMENT.id,
	messageKey = CURRENT_MARKETING_ANNOUNCEMENT.messageKey,
	tone = CURRENT_MARKETING_ANNOUNCEMENT.tone,
}: {
	id?: string;
	messageKey?: string;
	tone?: AnnouncementTone;
}) => {
	const { t } = useTranslation('common');
	const [isDismissed, setIsDismissed] = useState(false);

	// Read after mount, not during render: the server cannot know a per-visitor
	// dismissal, and rendering the bar first keeps SSR markup and the first
	// hydrated paint identical.
	useEffect(() => {
		setIsDismissed(readDismissed(id));
	}, [id]);

	if (isDismissed) {
		return null;
	}

	return (
		// A landmark, not a bare div: axe's `region` rule (and anyone
		// navigating by landmark) treats top-level content outside one as
		// unreachable chrome — the announcement is the only shell surface that
		// is neither banner, main, contentinfo nor a named region on its own.
		<aside
			aria-label={t('marketing-announcement-label')}
			data-testid="marketing-announcement-bar"
			data-tone={tone}
			className={cn(
				'border-b border-(--publy-border)',
				tone === 'promo'
					? 'bg-(--publy-primary-soft) text-(--publy-primary-soft-foreground)'
					: 'bg-(--publy-surface-muted) text-(--publy-foreground-secondary)',
			)}
		>
			<MarketingContainer
				width="chrome"
				className="flex min-h-10 items-center gap-3 py-2 lg:py-0"
			>
				<p className="publy-type-helper flex-1 text-current">{t(messageKey)}</p>
				<button
					type="button"
					aria-label={t('marketing-announcement-dismiss')}
					data-testid="marketing-announcement-dismiss"
					onClick={() => {
						writeDismissed(id);
						setIsDismissed(true);
					}}
					className="-mr-1 grid size-7 shrink-0 cursor-pointer place-items-center self-start rounded-[var(--publy-radius-small-control)] text-current outline-none hover:bg-(--publy-surface-hover) focus-visible:ring-3 focus-visible:ring-ring lg:self-center"
				>
					<IconX aria-hidden="true" className="size-4" />
				</button>
			</MarketingContainer>
		</aside>
	);
};
