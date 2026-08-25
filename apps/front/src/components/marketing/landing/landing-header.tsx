import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '~/components/app-shell/theme/theme-toggle';
import { buttonVariants } from '~/components/ui/button.variants';
import { cn } from '~/lib/utils';

import { MarketingBrand } from '../marketing-brand';

/**
 * The direction's own header (THE SKY owns its full shell — no chrome comes
 * from the shared `MarketingLayout` any more). It is neither a window nor a
 * panel: it is the frame the atmosphere sits inside, opaque
 * `bg-(--publy-background)` — exactly the sky ramp's own 0% stop
 * (`landing.css`), so there is no seam where the field begins under it.
 * Static bottom hairline, no scroll elevation, no hide-on-scroll, matching
 * the ratified header behaviour every other surface in the app ships.
 *
 * Content is flush with the ruled column's edges (`.publy-landing-ruled-column`)
 * so its vertical mullions read as continuous through the header, the
 * document body and the footer.
 */
export const LandingHeader = () => {
	const { t } = useTranslation('landing');

	return (
		<header
			data-testid="landing-header"
			className="sticky top-0 z-(--publy-z-shell-topbar) border-b border-(--publy-border) bg-(--publy-background)"
		>
			<div className="publy-landing-ruled-column flex h-(--publy-header-height) items-center gap-4 px-4 sm:px-6">
				<MarketingBrand />
				<nav
					aria-label={t('landing-nav-aria-label')}
					className="ml-2 hidden items-center gap-6 lg:flex"
				>
					<a
						href="#product-window"
						className="publy-landing-pressable publy-landing-focus-ring publy-type-sky-label rounded-[var(--publy-radius-small-control)] text-(--publy-foreground-secondary) no-underline hover:text-(--publy-foreground)"
					>
						{t('landing-nav-product')}
					</a>
					<a
						href="#pricing"
						className="publy-landing-pressable publy-landing-focus-ring publy-type-sky-label rounded-[var(--publy-radius-small-control)] text-(--publy-foreground-secondary) no-underline hover:text-(--publy-foreground)"
					>
						{t('landing-nav-pricing')}
					</a>
					<a
						href="#faq"
						className="publy-landing-pressable publy-landing-focus-ring publy-type-sky-label rounded-[var(--publy-radius-small-control)] text-(--publy-foreground-secondary) no-underline hover:text-(--publy-foreground)"
					>
						{t('landing-nav-faq')}
					</a>
				</nav>
				<div className="ml-auto flex items-center gap-2">
					<ThemeToggle className="hidden sm:inline-flex" />
					<Link
						to="/login"
						className={cn(
							buttonVariants({ variant: 'ghost', size: 'sm' }),
							'hidden no-underline sm:inline-flex',
						)}
					>
						{t('landing-nav-login')}
					</Link>
					<Link
						to="/signup"
						className={cn(
							buttonVariants({ variant: 'default', size: 'sm' }),
							'publy-landing-pressable whitespace-nowrap no-underline',
						)}
					>
						{t('landing-nav-cta')}
					</Link>
				</div>
			</div>
		</header>
	);
};
