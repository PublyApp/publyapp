import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '~/components/app-shell/theme/theme-toggle';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { useCondensedChrome } from './use-condensed-chrome';

const NAV_LINKS = [
	{ id: 'tour', hash: 'tour', labelKey: 'landing-06-nav-tour' },
	{ id: 'pricing', hash: 'pricing', labelKey: 'landing-06-nav-pricing' },
	{ id: 'faq', hash: 'faq', labelKey: 'landing-06-nav-faq' },
] as const;

/**
 * The shrinking frame (PROMPT.md §2). A wide, transparent, borderless bar
 * that collapses — across `position`, width, height, background, blur,
 * shadow, radius and the wordmark's opacity — into a narrow, frosted,
 * floating pill once `scrollY` crosses 72px. Every one of those eight
 * properties lives in `landing-06.css` under `[data-condensed]`; this
 * component only carries the boolean and the markup.
 *
 * This exploration owns a self-contained header rather than the shared
 * `MarketingHeader` (mega panel, multi-route nav) — the shrinking-frame
 * mechanic is this page's signature interaction and does not belong on the
 * production marketing routes.
 */
export const LandingHeader = () => {
	const { t } = useTranslation('landing-06');
	const condensed = useCondensedChrome();

	return (
		<header
			data-testid="landing-06-header"
			data-condensed={condensed ? 'true' : undefined}
			className="publy-landing-06-header"
		>
			<div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
				<Link
					to="/temp/landing-06"
					aria-label={t('landing-06-brand-aria-label')}
					className="publy-landing-06-brand-box shrink-0 no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring"
				>
					<span
						aria-hidden="true"
						className="grid size-6 shrink-0 place-items-center rounded-[var(--publy-radius-chip)] bg-primary text-[12.5px] font-semibold text-primary-foreground"
					>
						P
					</span>
					<span className="publy-landing-06-brand-wordmark text-[15.5px] font-semibold tracking-[-0.02em]">
						PublyApp
					</span>
				</Link>

				<nav
					aria-label={t('landing-06-nav-aria-label')}
					className="hidden items-center gap-1 lg:flex"
				>
					{NAV_LINKS.map((link) => (
						<Link
							key={link.id}
							to="/temp/landing-06"
							hash={link.hash}
							className="publy-landing-06-interactive publy-landing-06-type-small rounded-[var(--publy-radius-small-control)] px-3 py-2 text-(--publy-foreground-secondary) no-underline outline-none hover:text-(--publy-foreground) focus-visible:ring-3 focus-visible:ring-ring"
						>
							{t(link.labelKey)}
						</Link>
					))}
				</nav>

				<div className="flex shrink-0 items-center gap-2">
					<ThemeToggle />
					<Link
						to="/signup"
						className={cn(buttonVariants({ size: 'sm' }), 'no-underline')}
					>
						{t('landing-06-nav-cta')}
					</Link>
				</div>
			</div>
		</header>
	);
};
