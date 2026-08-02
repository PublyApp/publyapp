import { useTranslation } from 'react-i18next';
import { MarketingBrand } from '~/components/marketing/marketing-brand';
import { MarketingContainer } from '~/components/marketing/marketing-container';

/**
 * The exploration's footer frame: the same top rule and reading column the
 * shell's footer uses, reduced to the brand block and the copyright line so
 * the page ends on a settled edge. If the direction keeps link columns, they
 * land here with the content tasks.
 */
export const Landing08Footer = () => {
	const { t } = useTranslation('landing-08');

	return (
		<footer className="mt-auto border-t border-(--publy-border)">
			<MarketingContainer
				width="reading"
				className="flex flex-wrap items-center justify-between gap-4 py-8"
			>
				<MarketingBrand />
				<p className="publy-type-marginal">
					{t('footer-copyright', { year: new Date().getFullYear() })}
				</p>
			</MarketingContainer>
		</footer>
	);
};
