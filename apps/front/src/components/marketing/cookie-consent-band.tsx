import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { useCookieConsentStore } from '~/lib/store/cookie-consent-store';

import { MarketingContainer } from './marketing-container';

/**
 * Cookie consent band (#1038).
 *
 * Accept and Reject are equally sized and equally placed — the deliberate
 * exception to the one-primary-CTA rule, because an unequal pair is a dark
 * pattern here, not a hierarchy choice. There is no backdrop: the band never
 * blocks the page (the backdrop appears only with the preferences drawer).
 *
 * It renders only after the client has read the stored decision. Consent is
 * client state, so server-rendering the band would either flash it at
 * visitors who already decided or claim a decision the server cannot know.
 */
export const CookieConsentBand = ({
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
			aria-labelledby="marketing-cookie-band-title"
			data-testid="cookie-consent-band"
			className="fixed inset-x-0 bottom-0 z-(--publy-z-selection-bar) md:bottom-6"
		>
			<MarketingContainer width="reading" className="max-md:px-0">
				<div className="flex flex-col gap-4 border-t border-(--publy-border) bg-(--publy-surface-raised) p-5 shadow-[var(--publy-shadow-menu)] md:flex-row md:items-center md:justify-between md:rounded-[var(--publy-radius-control)] md:border-t-0">
					<div className="flex flex-col gap-1">
						<p
							id="marketing-cookie-band-title"
							className="text-sm font-semibold text-foreground"
						>
							{t('marketing-cookies-band-title')}
						</p>
						<p className="max-w-[68ch] text-[13px] leading-5 text-(--publy-foreground-muted)">
							{t('marketing-cookies-band-body')}
						</p>
					</div>
					<div className="flex flex-col gap-2 md:flex-row md:items-center">
						<Button
							variant="ghost"
							size="sm"
							onClick={onCustomize}
							data-testid="cookie-band-customize"
						>
							{t('marketing-cookies-customize')}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={rejectAll}
							data-testid="cookie-band-reject"
						>
							{t('marketing-cookies-reject-all')}
						</Button>
						<Button
							size="sm"
							onClick={acceptAll}
							data-testid="cookie-band-accept"
						>
							{t('marketing-cookies-accept-all')}
						</Button>
					</div>
				</div>
			</MarketingContainer>
		</div>
	);
};
