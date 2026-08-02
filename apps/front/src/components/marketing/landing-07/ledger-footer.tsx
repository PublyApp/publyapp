import { useTranslation } from 'react-i18next';

import { MarketingBrand } from '../marketing-brand';

/**
 * The footer frame (§4 Footer, §3.1): chrome, aligned to the same 1280px
 * ledger column as the header rather than the narrower reading width — the
 * resolution §3.1 describes for the page's pre-existing header/body
 * container mismatch. Cookie-consent UI is owned by the shared
 * MarketingShell (off-limits to this exploration) and already renders once
 * per page, so this frame does not duplicate it.
 */
export const LedgerFooter = () => {
	const { t } = useTranslation('landing-07');
	const year = new Date().getFullYear();

	return (
		<footer
			data-testid="landing-07-footer"
			className="border-t border-(--publy-rule)"
		>
			<div className="mx-auto flex w-full max-w-(--publy-container-chrome) flex-col items-start justify-between gap-4 px-4 py-10 sm:flex-row sm:items-center sm:px-6 lg:px-8">
				<MarketingBrand />
				<p className="ld07-caption text-(--publy-foreground-muted)">
					{t('footer-copyright', { year })}
				</p>
			</div>
		</footer>
	);
};
