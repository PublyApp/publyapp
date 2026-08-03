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
 * IT STAYS IN THE READING COLUMN. The bled version ran to the viewport edges
 * and, on a page whose whole structure is one column between two mullions,
 * that made the densest band the one place the ledger stopped being a ledger.
 *
 * The arithmetic, re-derived for the in-column cell. At >=1280 the column is
 * 1152 with 24px gutters, so the row is 1104 wide; three tracks with a 32px
 * gap give 1104 - 64 = 1040, 1040 / 3 = 346.67px per cell. The cells carry NO
 * horizontal padding — only `py-8` — so that 346.67px is the measure itself,
 * and 46 characters of the 15px body step is ~345px. The cell width lands on
 * the type ramp's own `body` cap to within 2px, which is why the count stays
 * at three: it is the widest count whose measure the ramp already allows.
 * Padding the cells instead would have indented the first column's text 32px
 * past the heading above it, which is the one thing a ledger cannot do.
 *
 * Six items divide by 1, 2, 3 and 6; a ragged last row is forbidden, so 1/2/3
 * are the only counts in play. Six across would be 168px — a 22ch measure.
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
		<div className="publy-l05a-section-body relative">
			{/* The two floating dividers live OUTSIDE the list: a `<ul>` may
			    only contain `<li>`, and a decorative div inside one is invalid
			    markup that some screen readers resolve by dropping the list
			    semantics entirely. They are inset from the grid's own top and
			    bottom rather than pinned to a measured height, so they cannot
			    drift when a locale changes a cell's line count — `fr` runs one
			    line longer than `en` in four of the six cells. */}
			<div
				aria-hidden="true"
				className="publy-l05a-fact-divider pointer-events-none absolute left-1/3 hidden w-px bg-(--publy-border) lg:block"
			/>
			<div
				aria-hidden="true"
				className="publy-l05a-fact-divider pointer-events-none absolute left-2/3 hidden w-px bg-(--publy-border) lg:block"
			/>
			{/* A real list, so the section announces "6 items" instead of six
			    unrelated paragraphs — six is the claim. `list-none` removes the
			    marker (the page draws its own structure with rules, and a
			    bullet beside a 20px icon is two bullets), and `role="list"` is
			    there because Safari drops list semantics from a `<ul>` whose
			    `list-style` is `none` — removing the marker must not also
			    remove the meaning. */}
			<ul
				role="list"
				className="publy-l05a-fact-grid grid list-none gap-x-8 md:grid-cols-2 lg:grid-cols-3"
			>
				{CAPABILITY_FACTS.map((fact) => (
					<li key={fact.key} className="publy-l05a-fact-cell py-8">
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
					</li>
				))}
			</ul>
		</div>
	);
};
