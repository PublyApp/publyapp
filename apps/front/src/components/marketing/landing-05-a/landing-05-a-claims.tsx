import { useTranslation } from 'react-i18next';

/**
 * §3 — three claims (attio-29 stat blocks, no chart, no icon). A 3px rule at
 * `--publy-primary` (attio-29's own fit note: a 2px rule reads low-contrast
 * on the brand yellow) plus `leading-none` binds the value and its label
 * into one object; `todesktop-05` metric parity keeps the label/detail pair
 * on the same 15/24 grid as the fact strip below it.
 */
const CLAIM_KEYS = ['plan', 'teamwork', 'traceability'] as const;

export const Landing05AClaims = () => {
	const { t } = useTranslation('landing-05-a');

	return (
		<div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-8">
			{CLAIM_KEYS.map((key) => (
				<div
					key={key}
					className="border-l-[3px] border-(--publy-primary) pl-4 sm:pl-6"
				>
					<p className="publy-type-sky-display-3 leading-none text-(--publy-foreground)">
						{t(`landing-claim-${key}-value`)}
					</p>
					<p className="publy-type-sky-label mt-1.5 text-(--publy-foreground)">
						{t(`landing-claim-${key}-title`)}
					</p>
					<p className="publy-type-sky-body mt-1.5 text-(--publy-foreground-secondary)">
						{t(`landing-claim-${key}-details`)}
					</p>
				</div>
			))}
		</div>
	);
};
