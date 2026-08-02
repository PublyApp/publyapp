import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { useCookieConsentStore } from '~/lib/store/cookie-consent-store';
import { cn } from '~/lib/utils';

/**
 * The cookie consent band, owned by this direction's own shell rather than
 * the shared `MarketingShell` (`__root.tsx` renders every /temp/landing-*
 * route bare). Frame and type come from this page's own vocabulary — the
 * footer's reading-width card, `.publy-landing-06-type-*`, and the same
 * `buttonVariants` every CTA on this page already uses — not the shared
 * band's own styling. Accept and reject stay equally weighted, the one
 * deliberate exception to a single-primary-CTA page: an unequal pair here is
 * a dark pattern, not a hierarchy choice.
 */
export const LandingCookieBand = ({
	onCustomize,
}: {
	onCustomize: () => void;
}) => {
	const { t } = useTranslation('common');
	const isHydrated = useCookieConsentStore((state) => state.isHydrated);
	const hasDecision = useCookieConsentStore((state) => state.hasDecision);
	const hydrateFromStorage = useCookieConsentStore(
		(state) => state.hydrateFromStorage,
	);
	const acceptAll = useCookieConsentStore((state) => state.acceptAll);
	const rejectAll = useCookieConsentStore((state) => state.rejectAll);

	useEffect(() => {
		hydrateFromStorage();
	}, [hydrateFromStorage]);

	if (!isHydrated || hasDecision) {
		return null;
	}

	return (
		<div
			role="region"
			aria-labelledby="landing-06-cookie-band-title"
			data-testid="landing-06-cookie-band"
			className="fixed inset-x-0 bottom-0 z-(--publy-z-selection-bar) md:bottom-6"
		>
			<div className="mx-auto flex w-full max-w-(--publy-container-reading) flex-col gap-4 border-t border-(--publy-border) bg-(--publy-surface-raised) p-5 px-4 shadow-[var(--publy-shadow-menu)] sm:px-6 md:flex-row md:items-center md:justify-between md:rounded-[var(--publy-radius-control)] md:border-t-0">
				<div className="flex flex-col gap-1">
					<p
						id="landing-06-cookie-band-title"
						className="publy-landing-06-type-body-label text-(--publy-foreground)"
					>
						{t('marketing-cookies-band-title')}
					</p>
					<p className="publy-landing-06-type-small max-w-[68ch] text-(--publy-foreground-muted)">
						{t('marketing-cookies-band-body')}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<button
						type="button"
						onClick={onCustomize}
						data-testid="landing-06-cookie-band-customize"
						className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
					>
						{t('marketing-cookies-customize')}
					</button>
					<button
						type="button"
						onClick={rejectAll}
						data-testid="landing-06-cookie-band-reject"
						className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
					>
						{t('marketing-cookies-reject-all')}
					</button>
					<button
						type="button"
						onClick={acceptAll}
						data-testid="landing-06-cookie-band-accept"
						className={cn(buttonVariants({ size: 'sm' }))}
					>
						{t('marketing-cookies-accept-all')}
					</button>
				</div>
			</div>
		</div>
	);
};
