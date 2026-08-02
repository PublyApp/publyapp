import { useTranslation } from 'react-i18next';

type AudienceEntry = {
	id:
		| 'shared-queue'
		| 'role-access'
		| 'teams-agencies'
		| 'inhouse-operations'
		| 'small-studios';
	titleKey: string;
	bodyKey: string;
};

const AUDIENCE_ENTRIES: readonly AudienceEntry[] = [
	{
		id: 'shared-queue',
		titleKey: 'landing-bento-shared-queue-title',
		bodyKey: 'landing-bento-shared-queue-body',
	},
	{
		id: 'role-access',
		titleKey: 'landing-bento-role-access-title',
		bodyKey: 'landing-bento-role-access-body',
	},
	{
		id: 'teams-agencies',
		titleKey: 'landing-bento-teams-agencies-title',
		bodyKey: 'landing-bento-teams-agencies-body',
	},
	{
		id: 'inhouse-operations',
		titleKey: 'landing-bento-inhouse-operations-title',
		bodyKey: 'landing-bento-inhouse-operations-body',
	},
	{
		id: 'small-studios',
		titleKey: 'landing-bento-small-studios-title',
		bodyKey: 'landing-bento-small-studios-body',
	},
];

/**
 * "Who it is for" — five cells in the hairline grid, 1 column below `sm`, 2
 * at `sm`, 3 at `lg`, so the last row deliberately holds two. No icons, no
 * watermarks: the page this direction replaces stamps a Tabler glyph behind
 * every tile, and this direction's ornament budget is spent entirely above
 * the fold.
 */
export const Landing08Audience = () => {
	const { t } = useTranslation('landing-08');

	return (
		<div className="publy-marketing-hairline-grid mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
			{AUDIENCE_ENTRIES.map((entry) => (
				<div key={entry.id} className="p-6">
					<h3 className="publy-type-copy-mark">{t(entry.titleKey)}</h3>
					<p className="publy-type-copy mt-2">{t(entry.bodyKey)}</p>
				</div>
			))}
		</div>
	);
};
