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
 *
 * COMPOSITIONAL BREAK 1 OF 2. This grid is the one thing on the page that
 * leaves the reading column: `.publy-l05a-bleed` runs it to the viewport
 * edges while the section's rule and its heading stay on the ledger's left
 * edge with every other section's. Six product surfaces is the one claim on
 * the page whose subject is BREADTH, so width is the argument — at 1440 the
 * cells go from 368px to 474px, and the page visibly inhales once. Its
 * companion move, the FAQ's asymmetric split, stays inside the column, so the
 * page leaves it exactly once.
 *
 * The three-column ceiling is arithmetic, not caution: six items divide by 1,
 * 2, 3 and 6, and six across a bled row would put each cell under 300px and
 * break the label/body line box. A ragged last row in a hairline grid reads
 * as a mistake, so 1/2/3 are the only counts allowed.
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
		<div className="publy-l05a-bleed publy-l05a-section-body">
			<div className="publy-l05a-fact-grid relative grid gap-x-8 md:grid-cols-2 lg:grid-cols-3">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-1/3 my-auto hidden h-[198px] w-px bg-(--publy-border) lg:block"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-2/3 my-auto hidden h-[198px] w-px bg-(--publy-border) lg:block"
				/>
				{CAPABILITY_FACTS.map((fact) => (
					<div key={fact.key} className="publy-l05a-fact-cell p-8">
						<fact.Icon
							className="size-5 text-(--publy-foreground-secondary)"
							aria-hidden="true"
						/>
						<p className="mt-4 max-w-[46ch] text-pretty">
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
		</div>
	);
};
