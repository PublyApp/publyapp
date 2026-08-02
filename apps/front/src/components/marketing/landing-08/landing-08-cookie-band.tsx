import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { useCookieConsentStore } from '~/lib/store/cookie-consent-store';
import { cn } from '~/lib/utils';

/**
 * The cookie consent band, owned by THE LONG FOLD's own shell rather than the
 * shared `MarketingShell` (`__root.tsx` renders every /temp/landing-* route
 * bare). No floating card — this direction's whole ethos is a flush reading
 * column with nothing rounded off it, so the band stays a flat, full-width
 * bar with one top rule, the same treatment `Landing08Footer` already uses.
 * `.publy-type-copy-mark`/`.publy-type-marginal` are this page's own type;
 * accept and reject stay equally weighted, a dark pattern otherwise.
 */
export const Landing08CookieBand = ({
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
			aria-labelledby="landing-08-cookie-band-title"
			data-testid="landing-08-cookie-band"
			className="fixed inset-x-0 bottom-0 z-(--publy-z-selection-bar) border-t border-(--publy-border) bg-(--publy-background)"
		>
			<div className="mx-auto flex w-full max-w-(--publy-container-reading) flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
				<div className="flex flex-col gap-1">
					<p
						id="landing-08-cookie-band-title"
						className="publy-type-copy publy-type-copy-mark"
					>
						{t('marketing-cookies-band-title')}
					</p>
					<p className="publy-type-marginal max-w-[68ch]">
						{t('marketing-cookies-band-body')}
					</p>
				</div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<button
						type="button"
						onClick={onCustomize}
						data-testid="landing-08-cookie-band-customize"
						className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
					>
						{t('marketing-cookies-customize')}
					</button>
					<button
						type="button"
						onClick={rejectAll}
						data-testid="landing-08-cookie-band-reject"
						className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
					>
						{t('marketing-cookies-reject-all')}
					</button>
					<button
						type="button"
						onClick={acceptAll}
						data-testid="landing-08-cookie-band-accept"
						className={cn(buttonVariants({ size: 'sm' }))}
					>
						{t('marketing-cookies-accept-all')}
					</button>
				</div>
			</div>
		</div>
	);
};
