import {
	IconCalendar,
	IconHistory,
	IconLayoutDashboard,
	IconPencil,
	IconShieldCheck,
	IconUsersGroup,
	type Icon,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

const CELLS: readonly { id: string; icon: Icon }[] = [
	{ id: 'calendar', icon: IconCalendar },
	{ id: 'composer', icon: IconPencil },
	{ id: 'approvals', icon: IconShieldCheck },
	{ id: 'profiles', icon: IconUsersGroup },
	{ id: 'dashboards', icon: IconLayoutDashboard },
	{ id: 'audit', icon: IconHistory },
];

/**
 * The capability strip (PROMPT.md §5): six facts already live in the beta,
 * no images, no section eyebrow/heading. §5.2–§5.4's own worked example
 * gives only cell-level copy keys and states the payoff explicitly — landing
 * immediately after the hero's 620px slot with "nothing missing". A second
 * heading here would restate the hero's claim and blunt that beat, so this
 * section is the page's one deliberate exception to §1.3's blanket
 * eyebrow-heading-deck opening (see report-t2.md for the reasoning).
 */
export const LandingCapabilityStrip = () => {
	const { t } = useTranslation('landing-06');

	return (
		<div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
			{/* Vertical rule lines (todesktop-31): deliberately shorter than the
			    cells so they float as hairlines rather than closing the grid
			    into boxes. */}
			<div
				aria-hidden="true"
				className="absolute top-1/2 left-1/3 hidden h-[132px] w-px -translate-y-1/2 bg-(--publy-border) lg:block"
			/>
			<div
				aria-hidden="true"
				className="absolute top-1/2 left-2/3 hidden h-[132px] w-px -translate-y-1/2 bg-(--publy-border) lg:block"
			/>
			{CELLS.map(({ id, icon: CellIcon }, index) => (
				<div
					key={id}
					className={cn(
						// §14.3: "one column, border-t between cells" on mobile — a
						// row divider is every cell after the first at whatever
						// column count is active (1 col mobile, 2 col md, 3 col lg),
						// i.e. `index >= columnCount`. The two overrides below remove
						// the divider from cells that are still in row one once the
						// grid gains columns: index 1 leaves row one at md (2-col);
						// index 2 leaves row one at lg (3-col) — and `md:border-t-0`
						// on index 1 persists upward through lg since no later
						// breakpoint re-adds it.
						'flex gap-3 border-(--publy-border) p-6',
						index >= 1 && 'border-t',
						index === 1 && 'md:border-t-0',
						index === 2 && 'lg:border-t-0',
					)}
				>
					<CellIcon
						aria-hidden="true"
						className="mt-0.5 size-[18px] shrink-0 text-(--publy-marketing-eyebrow-accent)"
					/>
					{/* todesktop-05's label/body parity trick: identical metrics,
					    +100 weight, one colour rank apart, one line box. */}
					<p className="flex-1">
						<span className="publy-landing-06-type-body-label text-(--publy-foreground)">
							{t(`landing-06-strip-${id}-label`)}
						</span>{' '}
						<span className="publy-landing-06-type-body text-(--publy-foreground-secondary)">
							{t(`landing-06-strip-${id}-body`)}
						</span>
					</p>
				</div>
			))}
		</div>
	);
};
