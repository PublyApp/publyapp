import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { useCookieConsentStore } from '~/lib/store/cookie-consent-store';
import { cn } from '~/lib/utils';

/**
 * The cookie consent band, owned by THE LEDGER's own shell rather than the
 * shared `MarketingShell` (`__root.tsx` renders every /temp/landing-* route
 * bare). Styled as one more ledger row rather than a floating card: full
 * width, `ld07-row-raised`'s ground alternation, a `--publy-rule-strong` top
 * seam matching every other row boundary on the page, `ld07-*` type. Accept
 * and reject stay equally weighted — a dark pattern here, not a hierarchy
 * choice.
 */
export const LedgerCookieBand = ({
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
			aria-labelledby="landing-07-cookie-band-title"
			data-testid="landing-07-cookie-band"
			className="ld07-row-raised fixed inset-x-0 bottom-0 z-(--publy-z-selection-bar) border-t border-(--publy-rule-strong)"
		>
			<div className="mx-auto flex w-full max-w-(--publy-container-chrome) flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
				<div className="flex flex-col gap-1">
					<p
						id="landing-07-cookie-band-title"
						className="ld07-body-label-small text-(--publy-foreground)"
					>
						{t('marketing-cookies-band-title')}
					</p>
					<p className="ld07-body-small max-w-[68ch] text-(--publy-foreground-muted)">
						{t('marketing-cookies-band-body')}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<button
						type="button"
						onClick={onCustomize}
						data-testid="landing-07-cookie-band-customize"
						className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
					>
						{t('marketing-cookies-customize')}
					</button>
					<button
						type="button"
						onClick={rejectAll}
						data-testid="landing-07-cookie-band-reject"
						className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
					>
						{t('marketing-cookies-reject-all')}
					</button>
					<button
						type="button"
						onClick={acceptAll}
						data-testid="landing-07-cookie-band-accept"
						className={cn(buttonVariants({ size: 'sm' }))}
					>
						{t('marketing-cookies-accept-all')}
					</button>
				</div>
			</div>
		</div>
	);
};
