import { useTranslation } from 'react-i18next';

const CLAIMS = ['permissions', 'traceability', 'isolation'] as const;

/**
 * Differentiators (PROMPT.md §8): the three claims `_context.md` §1 actually
 * lets this page defend — per-action permissions, draft→approval→publish
 * traceability, profile-level isolation — on the page's one inverted band
 * (`data-band="inverted"` on the parent `LandingTierSection`, §1.2/§8.2).
 * Every semantic token inside is re-scoped by `landing-06.css`'s
 * `html:not(.dark) [data-band='inverted']` block, so this component reaches
 * for the same tokens as everywhere else on the page and never hand-paints a
 * colour.
 *
 * No slot. Three `border-l-2` accent columns (`attio-29`, repurposed for
 * claims rather than invented numbers) on the inverted surface — complete
 * without imagery.
 */
export const LandingDifferentiators = () => {
	const { t } = useTranslation('landing-06');

	return (
		<div>
			<p className="publy-landing-06-eyebrow-mono">
				{t('landing-06-diff-eyebrow')}
			</p>
			<h2 className="publy-landing-06-type-display-3 mt-3 max-w-[26ch] text-balance">
				<span className="text-(--publy-foreground)">
					{t('landing-06-diff-title-claim')}
				</span>{' '}
				<span className="text-(--publy-foreground-muted)">
					{t('landing-06-diff-title-elaboration')}
				</span>
			</h2>
			<div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
				{CLAIMS.map((id) => (
					<div
						key={id}
						className="flex flex-col gap-3 border-l-2 border-(--publy-primary) pl-5"
					>
						<p className="publy-landing-06-eyebrow-mono">
							{t(`landing-06-diff-${id}-eyebrow`)}
						</p>
						<h3 className="publy-landing-06-type-display-4">
							{t(`landing-06-diff-${id}-title`)}
						</h3>
						<p className="publy-landing-06-type-body text-(--publy-foreground-secondary)">
							{t(`landing-06-diff-${id}-body`)}
						</p>
					</div>
				))}
			</div>
		</div>
	);
};
