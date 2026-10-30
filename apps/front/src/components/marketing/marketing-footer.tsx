import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { MarketingBrand } from './marketing-brand';
import { MarketingContainer } from './marketing-container';
import {
	MARKETING_FOOTER_COLUMNS,
	type MarketingFooterColumn,
	routedFooterColumns,
} from './marketing-nav';

/**
 * Marketing footer (#1038), at READING width — deliberately 128px narrower
 * than the header at >=1280. The footer is read, and a footer wider than the
 * body content above it is the exact inconsistency the container roles were
 * introduced to end.
 *
 * Grid: 1 column below 768, 2 columns (brand block spanning both) through
 * 1023, then `1.5fr repeat(4, 1fr)`.
 */
export const MarketingFooter = ({
	columns = MARKETING_FOOTER_COLUMNS,
	onManageCookiePreferences,
}: {
	columns?: readonly MarketingFooterColumn[];
	onManageCookiePreferences: () => void;
}) => {
	const { t } = useTranslation('common');
	const renderableColumns = routedFooterColumns(columns);

	return (
		<footer
			data-testid="marketing-footer"
			className="mt-auto border-t border-(--publy-border)"
		>
			<MarketingContainer width="reading" className="py-12">
				<div className="publy-marketing-footer-grid grid gap-10">
					<div className="publy-marketing-footer-brand flex flex-col gap-4">
						<MarketingBrand />
						<p className="max-w-[36ch] text-[13.5px] leading-[1.6] text-(--publy-foreground-muted)">
							{t('marketing-footer-blurb')}
						</p>
					</div>
					{renderableColumns.map((column) => (
						<nav
							key={column.id}
							aria-label={t(column.titleKey)}
							className="flex flex-col gap-3"
						>
							<p className="text-[13px] font-semibold text-foreground">
								{t(column.titleKey)}
							</p>
							{column.links.map((link) => (
								<Link
									key={link.id}
									to={link.to}
									hash={link.hash}
									data-footer-link={link.id}
									className="text-[13.5px] text-(--publy-foreground-muted) no-underline outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
								>
									{t(link.labelKey)}
								</Link>
							))}
						</nav>
					))}
				</div>
				<div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-(--publy-border) pt-6">
					<p className="publy-type-helper text-(--publy-foreground-muted)">
						{t('marketing-footer-copyright', {
							year: new Date().getFullYear(),
						})}
					</p>
					{/* Not a link: cookie preferences are a client-side consent
					    surface, so the control that reopens them is a button. */}
					<button
						type="button"
						onClick={onManageCookiePreferences}
						data-testid="marketing-manage-cookies"
						className="cursor-pointer rounded-[var(--publy-radius-small-control)] text-[13.5px] text-(--publy-foreground-muted) underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring"
					>
						{t('marketing-manage-cookie-preferences')}
					</button>
				</div>
			</MarketingContainer>
		</footer>
	);
};
