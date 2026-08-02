import {
	IconCalendar,
	IconKey,
	IconLayoutDashboard,
	IconPencil,
	IconShieldCheck,
	type TablerIcon,
	IconUsersGroup,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

/**
 * §4 — the six-fact strip (todesktop-31): the densest, cheapest section on
 * the page, doing what a features grid would do at a fifth of the height.
 * Each cell is a 20px icon plus a flowing sentence built from `todesktop-05`
 * metric parity (label + body share the 15/24 grid), never a card.
 */
type CapabilityFact = {
	key: string;
	Icon: TablerIcon;
};

const CAPABILITY_FACTS: readonly CapabilityFact[] = [
	{ key: 'calendar', Icon: IconCalendar },
	{ key: 'composer', Icon: IconPencil },
	{ key: 'approvals', Icon: IconShieldCheck },
	{ key: 'profiles', Icon: IconUsersGroup },
	{ key: 'dashboards', Icon: IconLayoutDashboard },
	{ key: 'permissions', Icon: IconKey },
];

export const Landing05ACapabilities = () => {
	const { t } = useTranslation('landing-05-a');

	return (
		<div className="publy-l05a-fact-grid relative mt-8 grid gap-x-4 md:grid-cols-2 lg:grid-cols-3">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-1/3 my-auto hidden h-[198px] w-px bg-(--publy-border) lg:block"
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-2/3 my-auto hidden h-[198px] w-px bg-(--publy-border) lg:block"
			/>
			{CAPABILITY_FACTS.map((fact) => (
				<div key={fact.key} className="publy-l05a-fact-cell p-8 pr-4">
					<fact.Icon
						className="size-5 text-(--publy-foreground-secondary)"
						aria-hidden="true"
					/>
					<p className="mt-4">
						<span className="publy-type-sky-label mr-1 inline-block text-(--publy-foreground)">
							{t(`landing-capability-${fact.key}-lead`)}
						</span>
						<span className="publy-type-sky-body text-(--publy-foreground-secondary)">
							{t(`landing-capability-${fact.key}-body`)}
						</span>
					</p>
				</div>
			))}
		</div>
	);
};
