import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '~/components/app-shell/theme/theme-toggle';
import { MarketingBrand } from '~/components/marketing/marketing-brand';
import { MarketingContainer } from '~/components/marketing/marketing-container';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

/**
 * The exploration's own chrome header. The /temp routes render outside the
 * marketing shell, so this lane carries a minimal stand-in that keeps the
 * shell's geometry exactly: sticky, one `--publy-header-height` tall, hairline
 * bottom rule, brand flush with the reading column's left edge — the spine
 * every section aligns to. The fold's height ledger is computed against that
 * same header token, so this stand-in must never drift from it.
 *
 * The nav holds the two in-page anchors only. Both stay plain anchors: they
 * target hashes on this page, not route paths.
 */
export const Landing08Header = () => {
	const { t } = useTranslation('landing-08');

	return (
		<header className="sticky top-0 z-(--publy-z-shell-topbar) border-b border-(--publy-border) bg-(--publy-background)">
			<MarketingContainer
				width="reading"
				className="flex h-(--publy-header-height) items-center gap-4"
			>
				<MarketingBrand />
				<nav
					aria-label={t('chrome-nav-label')}
					className="ml-2 hidden items-center gap-1 md:flex"
				>
					<a
						href="#surfaces"
						className="publy-marketing-nav-link no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring"
					>
						{t('chrome-nav-product')}
					</a>
					<a
						href="#faq"
						className="publy-marketing-nav-link no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring"
					>
						{t('chrome-nav-faq')}
					</a>
				</nav>
				<div className="ml-auto flex items-center gap-2">
					<ThemeToggle className="hidden sm:inline-flex" />
					<Link
						to="/signup"
						className={cn(
							buttonVariants({ variant: 'default', size: 'sm' }),
							'whitespace-nowrap no-underline',
						)}
					>
						{t('landing-hero-primary-cta')}
					</Link>
				</div>
			</MarketingContainer>
		</header>
	);
};
