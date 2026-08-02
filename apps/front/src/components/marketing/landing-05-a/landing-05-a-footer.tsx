import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { MarketingBrand } from '../marketing-brand';

/**
 * The direction's own footer. Chrome, not an object on the atmosphere: it
 * sits below `<main>` on plain `--publy-background` (the sky's own 100%
 * stop), separated by one hairline rule rather than a filled band — the same
 * "a rule instead of a seam" discipline the ruled column uses throughout the
 * page (`landing-05-a.css` §"the ruled column"). Its content shares the ruled
 * column's width and gutters so the page's vertical mullions read as
 * continuous from the header through the last section to here.
 */
export const Landing05AFooter = () => {
	const { t } = useTranslation('landing-05-a');
	const year = new Date().getFullYear();

	return (
		<footer
			data-testid="landing-05-a-footer"
			className="mt-auto border-t border-(--publy-border)"
		>
			<div className="publy-l05a-ruled-column flex flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
				<div className="flex flex-wrap items-center justify-between gap-6">
					<MarketingBrand />
					<nav
						aria-label={t('landing-footer-nav-aria-label')}
						className="flex flex-wrap items-center gap-x-6 gap-y-2"
					>
						<a
							href="#product-window"
							className="publy-l05a-pressable publy-l05a-focus-ring publy-type-sky-label rounded-[var(--publy-radius-small-control)] text-(--publy-foreground-secondary) no-underline hover:text-(--publy-foreground)"
						>
							{t('landing-nav-product')}
						</a>
						<a
							href="#pricing"
							className="publy-l05a-pressable publy-l05a-focus-ring publy-type-sky-label rounded-[var(--publy-radius-small-control)] text-(--publy-foreground-secondary) no-underline hover:text-(--publy-foreground)"
						>
							{t('landing-nav-pricing')}
						</a>
						<a
							href="#faq"
							className="publy-l05a-pressable publy-l05a-focus-ring publy-type-sky-label rounded-[var(--publy-radius-small-control)] text-(--publy-foreground-secondary) no-underline hover:text-(--publy-foreground)"
						>
							{t('landing-nav-faq')}
						</a>
						<Link
							to="/login"
							className={cn(
								buttonVariants({ variant: 'ghost', size: 'sm' }),
								'no-underline',
							)}
						>
							{t('landing-nav-login')}
						</Link>
						<Link
							to="/signup"
							className={cn(
								buttonVariants({ variant: 'default', size: 'sm' }),
								'publy-l05a-pressable no-underline',
							)}
						>
							{t('landing-nav-cta')}
						</Link>
					</nav>
				</div>
				<p className="publy-type-helper">
					{t('landing-footer-copyright', { year })}
				</p>
			</div>
		</footer>
	);
};
