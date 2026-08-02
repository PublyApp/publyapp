import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const PRODUCT_LINKS = [
	{ id: 'tour', hash: 'tour' },
	{ id: 'differentiators', hash: 'differentiators' },
	{ id: 'pricing', hash: 'pricing' },
	{ id: 'faq', hash: 'faq' },
] as const;

// A literal `t('landing-06-…')` call per branch, not a `labelKey:` data-array
// property — the i18n coverage guard's dedicated `labelKey:` extractor always
// resolves against the 'common' namespace (it exists for unrelated breadcrumb
// crumbs), which would misfile this page's own namespaced keys and fail the
// coverage check.
const productLinkLabel = (
	t: (key: string) => string,
	id: (typeof PRODUCT_LINKS)[number]['id'],
) => {
	switch (id) {
		case 'tour':
			return t('landing-06-nav-tour');
		case 'differentiators':
			return t('landing-06-footer-link-differentiators');
		case 'pricing':
			return t('landing-06-nav-pricing');
		case 'faq':
			return t('landing-06-nav-faq');
	}
};

/**
 * The footer (PROMPT.md §12.4): `todesktop-34`'s two-tone inversion — group
 * headings at the *faintest* rank, links at the *loudest*, because a footer
 * reader is looking for a destination, not a category. No status pill
 * (`todesktop-35`): that needs an actual status endpoint, and this page
 * doesn't have one.
 *
 * Only two real destination groups ship: in-page sections and the two auth
 * routes this app actually has. `_context.md`'s honesty constraint rules out
 * a fourth invented column (Company/Legal/Resources) with nowhere to send a
 * reader — see report-t3.md.
 */
export const LandingFooter = () => {
	const { t } = useTranslation('landing-06');

	return (
		<footer
			data-testid="landing-06-footer"
			className="mt-auto border-t border-(--publy-border)"
		>
			<div className="mx-auto flex w-full max-w-(--publy-container-reading) flex-col px-4 sm:px-6">
				<div className="flex flex-wrap items-center justify-between gap-6 pt-14">
					<div className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="grid size-6 shrink-0 place-items-center rounded-[var(--publy-radius-chip)] bg-primary text-[12.5px] font-semibold text-primary-foreground"
						>
							P
						</span>
						<span className="text-[15.5px] font-semibold tracking-[-0.02em] text-foreground">
							PublyApp
						</span>
					</div>
					<div className="grid grid-cols-2 gap-8 sm:flex sm:gap-16">
						<div className="flex flex-col gap-3">
							<p className="publy-landing-06-type-small text-(--publy-foreground-muted)">
								{t('landing-06-footer-group-product')}
							</p>
							<ul className="flex flex-col gap-2">
								{PRODUCT_LINKS.map((link) => (
									<li key={link.id}>
										<Link
											to="/temp/landing-06"
											hash={link.hash}
											className="publy-landing-06-interactive publy-landing-06-type-small no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring"
										>
											{productLinkLabel(t, link.id)}
										</Link>
									</li>
								))}
							</ul>
						</div>
						<div className="flex flex-col gap-3">
							<p className="publy-landing-06-type-small text-(--publy-foreground-muted)">
								{t('landing-06-footer-group-account')}
							</p>
							<ul className="flex flex-col gap-2">
								<li>
									<Link
										to="/signup"
										className="publy-landing-06-interactive publy-landing-06-type-small no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring"
									>
										{t('landing-06-nav-cta')}
									</Link>
								</li>
								<li>
									<Link
										to="/login"
										className="publy-landing-06-interactive publy-landing-06-type-small no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring"
									>
										{t('landing-06-footer-link-login')}
									</Link>
								</li>
							</ul>
						</div>
					</div>
				</div>
				<div className="mt-18 border-t border-(--publy-border) pt-12 pb-10">
					<p className="publy-landing-06-type-small text-(--publy-foreground-muted)">
						{t('landing-06-footer-copyright', {
							year: new Date().getFullYear(),
						})}
					</p>
				</div>
			</div>
		</footer>
	);
};
