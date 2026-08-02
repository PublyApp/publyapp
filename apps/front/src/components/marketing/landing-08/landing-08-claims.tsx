import { useTranslation } from 'react-i18next';

type ClaimEntry = {
	id: 'plan' | 'teamwork' | 'traceability';
	titleKey: string;
	valueKey: string;
	detailsKey: string;
};

const CLAIM_ENTRIES: readonly ClaimEntry[] = [
	{
		id: 'plan',
		titleKey: 'landing-claim-plan-title',
		valueKey: 'landing-claim-plan-value',
		detailsKey: 'landing-claim-plan-details',
	},
	{
		id: 'teamwork',
		titleKey: 'landing-claim-teamwork-title',
		valueKey: 'landing-claim-teamwork-value',
		detailsKey: 'landing-claim-teamwork-details',
	},
	{
		id: 'traceability',
		titleKey: 'landing-claim-traceability-title',
		valueKey: 'landing-claim-traceability-value',
		detailsKey: 'landing-claim-traceability-details',
	},
];

/**
 * The three-cell fact strip for "what is different" — the repo's existing
 * hairline-grid trick standing in for todesktop-31's absolutely-positioned
 * dividers, with the copy/copy-mark metric parity carrying the inline
 * `Label. Continuation.` pattern. No icons: three glyphs chosen only to fill
 * space would be the imagery ruling's failure mode in a different costume.
 */
export const Landing08Claims = () => {
	const { t } = useTranslation('landing-08');

	return (
		<div className="publy-marketing-hairline-grid mt-8 grid grid-cols-1 sm:grid-cols-3">
			{CLAIM_ENTRIES.map((claim) => (
				<div
					key={claim.id}
					className="px-0 py-8 sm:px-6 sm:first:pl-0 sm:last:pr-0"
				>
					<p className="publy-type-mono">{t(claim.titleKey)}</p>
					<p className="publy-type-copy mt-3">
						<span className="publy-type-copy-mark">{t(claim.valueKey)}</span>{' '}
						{t(claim.detailsKey)}
					</p>
				</div>
			))}
		</div>
	);
};
