import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';

const CELLS: readonly { id: string; subject: string }[] = [
	{
		id: 'who-agency',
		subject: 'An agency workspace with several client profiles side by side',
	},
	{ id: 'who-inhouse', subject: "An in-house team's single-brand week" },
	{ id: 'who-studio', subject: "A two-person studio's queue" },
];

/**
 * Who it is for (PROMPT.md §9): a `gap-px` hairline grid (`attio-15`) of
 * three segments, each closing with a `plane-15` bleed slot pinned to the
 * cell floor by `mt-auto` so unequal copy lengths still align their empty
 * intervals. One shared background colour on the grid replaces per-cell
 * border management — no double-border problem at any junction.
 */
export const LandingWho = () => {
	const { t } = useTranslation('landing-06');

	return (
		<div>
			<p className="publy-landing-06-eyebrow-mono">
				{t('landing-06-who-eyebrow')}
			</p>
			<h2 className="publy-landing-06-type-display-3 mt-3 max-w-[28ch] text-balance">
				<span className="text-(--publy-foreground)">
					{t('landing-06-who-title-claim')}
				</span>{' '}
				<span className="text-(--publy-foreground-muted)">
					{t('landing-06-who-title-elaboration')}
				</span>
			</h2>
			<div className="publy-landing-06-inset-hairline mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--publy-radius-control)] bg-(--publy-border) md:grid-cols-3">
				{CELLS.map(({ id, subject }) => {
					const prefix = id.replace('who-', '');
					return (
						<div key={id} className="flex flex-col bg-(--publy-surface)">
							<div className="flex flex-col gap-2 p-6 pb-5">
								<h3 className="publy-landing-06-type-display-4">
									{t(`landing-06-who-${prefix}-title`)}
								</h3>
								<p className="publy-landing-06-type-body text-(--publy-foreground-secondary)">
									{t(`landing-06-who-${prefix}-body`)}
								</p>
							</div>
							{/* mt-auto pins the slot to the cell floor (plane-15) so cards
							    of unequal text length still align their reserved intervals;
							    padding on three sides only lets a future screenshot bleed
							    off the bottom edge. */}
							<div className="mt-auto px-6 pt-1">
								<div className="overflow-hidden rounded-t-[var(--publy-radius-small-control)]">
									<MarketingImageSlot
										slot={id}
										subject={subject}
										ratio="4 / 3"
										alt={`landing-06-who-${prefix}-image-alt`}
										className="publy-landing-06-slot-4-3 publy-landing-06-slot-tier-d2"
									/>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};
