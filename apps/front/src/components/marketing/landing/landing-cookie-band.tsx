import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';
import { useCookieConsentStore } from '~/lib/store/cookie-consent-store';
import { cn } from '~/lib/utils';

/**
 * The cookie consent band, owned by THE SKY's own shell rather than the
 * shared `MarketingShell` (`__root.tsx` renders every /temp/landing-* route
 * bare). A panel — `bg-(--publy-surface-raised)` plus a hairline ring — never
 * a window, since there is nothing behind it to see through; the generic
 * `--publy-shadow-menu` token carries its elevation rather than either of the
 * page's own cascades, which stay budgeted to the product window and the one
 * pricing tray (`landing.css`, "THE THREE SURFACES"). The band is chrome
 * rather than page — it is not one of the three surfaces, which is exactly why
 * it borrows a system token. Type and press motion are this page's own
 * (`.publy-type-sky-*`, `.publy-landing-pressable`). Accept and reject stay
 * equally weighted — a dark pattern otherwise, not a hierarchy choice.
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
			aria-labelledby="landing-cookie-band-title"
			data-testid="landing-cookie-band"
			className="fixed inset-x-0 bottom-0 z-(--publy-z-selection-bar) md:bottom-6"
		>
			<div className="mx-auto flex w-full max-w-(--publy-container-reading) flex-col gap-4 border-t border-(--publy-border) bg-(--publy-surface-raised) p-5 px-4 shadow-[var(--publy-shadow-menu)] sm:px-6 md:flex-row md:items-center md:justify-between md:rounded-[var(--publy-radius-control)] md:border-t-0">
				<div className="flex flex-col gap-1">
					<p
						id="landing-cookie-band-title"
						className="publy-type-sky-label text-(--publy-foreground)"
					>
						{t('marketing-cookies-band-title')}
					</p>
					<p className="publy-type-sky-body max-w-[68ch] text-(--publy-foreground-secondary)">
						{t('marketing-cookies-band-body')}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<button
						type="button"
						onClick={onCustomize}
						data-testid="landing-cookie-band-customize"
						className={cn(
							buttonVariants({ variant: 'ghost', size: 'sm' }),
							'publy-landing-pressable',
						)}
					>
						{t('marketing-cookies-customize')}
					</button>
					<button
						type="button"
						onClick={rejectAll}
						data-testid="landing-cookie-band-reject"
						className={cn(
							buttonVariants({ variant: 'outline', size: 'sm' }),
							'publy-landing-pressable',
						)}
					>
						{t('marketing-cookies-reject-all')}
					</button>
					<button
						type="button"
						onClick={acceptAll}
						data-testid="landing-cookie-band-accept"
						className={cn(
							buttonVariants({ size: 'sm' }),
							'publy-landing-pressable',
						)}
					>
						{t('marketing-cookies-accept-all')}
					</button>
				</div>
			</div>
		</div>
	);
};
