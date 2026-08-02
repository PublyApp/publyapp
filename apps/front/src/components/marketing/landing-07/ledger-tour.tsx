import {
	IconCalendar,
	IconChevronDown,
	IconLayoutDashboard,
	IconPencil,
	IconShieldCheck,
	IconUsersGroup,
} from '@tabler/icons-react';
import { type KeyboardEvent, type ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { cn } from '~/lib/utils';

import { LedgerRowHeader } from './ledger-row-header';
import { useLedgerReveal } from './use-ledger-reveal';

type TourTabId =
	| 'calendar'
	| 'composer'
	| 'approvals'
	| 'profiles'
	| 'dashboards';

type TourTab = {
	id: TourTabId;
	// Deliberately not `labelKey`: the i18n coverage guard special-cases that
	// exact property name to always resolve against the 'common' namespace
	// (built for app-shell.tsx's breadcrumbs), which would misfile every key
	// below as `common:tour-tab-*-label` instead of this namespace. See
	// src/lib/i18n-key-coverage.test.ts's `extractLabelKeyPropertyUsages`.
	nameKey: string;
	titleKey: string;
	descriptionKey: string;
	/** The `MarketingImageSlot` `subject` — documentation only, never rendered. */
	subject: string;
	icon: ReactElement;
};

// The five product surfaces named in _context.md §1, unchanged from the
// TOUR_TABS census in routes/index.tsx — same ids, same i18n keys, same
// order (PROMPT.md §4 Row 04, §9.2: "all landing-tour-* … reused unchanged").
const TOUR_TABS: readonly TourTab[] = [
	{
		id: 'calendar',
		nameKey: 'tour-tab-calendar-label',
		titleKey: 'tour-tab-calendar-title',
		descriptionKey: 'tour-tab-calendar-description',
		subject:
			'One week across four brand profiles; scheduled and queued posts in one timeline',
		icon: <IconCalendar className="size-4" />,
	},
	{
		id: 'composer',
		nameKey: 'tour-tab-composer-label',
		titleKey: 'tour-tab-composer-title',
		descriptionKey: 'tour-tab-composer-description',
		subject: 'One draft with three per-channel variants side by side',
		icon: <IconPencil className="size-4" />,
	},
	{
		id: 'approvals',
		nameKey: 'tour-tab-approvals-label',
		titleKey: 'tour-tab-approvals-title',
		descriptionKey: 'tour-tab-approvals-description',
		subject: 'A post in review: requester, approver, state, the action buttons',
		icon: <IconShieldCheck className="size-4" />,
	},
	{
		id: 'profiles',
		nameKey: 'tour-tab-profiles-label',
		titleKey: 'tour-tab-profiles-title',
		descriptionKey: 'tour-tab-profiles-description',
		subject: 'The profile list with per-profile membership and permissions',
		icon: <IconUsersGroup className="size-4" />,
	},
	{
		id: 'dashboards',
		nameKey: 'tour-tab-dashboards-label',
		titleKey: 'tour-tab-dashboards-title',
		descriptionKey: 'tour-tab-dashboards-description',
		subject: 'The weekly cross-profile summary: pacing, execution, pending',
		icon: <IconLayoutDashboard className="size-4" />,
	},
];

// attio-28's proportional-but-capped strategy (PROMPT.md §5.1–5.2): fixed
// heights at mobile/tablet, `min(38vw, 520px)` at desktop so the reserved
// field never becomes a full screen of nothing on a narrow viewport.
const TOUR_SLOT_HEIGHT =
	'h-[220px] sm:h-[300px] md:h-[380px] lg:h-[min(38vw,520px)]';

/**
 * Row 04 — The product tour (PROMPT.md §4 Row 04). The page's largest
 * structure and the home of five of the eight image slots. Desktop
 * (`padyna-10`) is a five-cell tab strip over a two-cell well+caption panel;
 * mobile (`padyna-11`) is the same five surfaces as an accordion — tabs never
 * become a horizontal scroller. Both trees render at all times; only one is
 * ever visible, toggled by breakpoint (`hidden md:block` / `md:hidden`), so
 * nothing depends on JavaScript having run.
 *
 * Empty-slot reading: a five-cell index strip above a two-cell panel whose
 * first cell is the empty, ruled field and whose second cell is a tinted
 * caption carrying a real heading and a real description. The tab strip
 * carries the entire narrative in text — five titles, five descriptions,
 * five numbers — which is `todesktop-28`'s explicit substitution for a hero
 * screenshot.
 */
export const LedgerTour = ({ rowNumber }: { rowNumber: string }) => {
	const { t } = useTranslation('landing-07');
	const [activeTab, setActiveTab] = useState<TourTabId>('calendar');
	const activeIndex = TOUR_TABS.findIndex((tab) => tab.id === activeTab);
	const reveal = useLedgerReveal<HTMLDivElement>(0);

	const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		let nextIndex = activeIndex;

		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				nextIndex = (activeIndex + 1) % TOUR_TABS.length;
				break;
			case 'ArrowLeft':
				event.preventDefault();
				nextIndex = (activeIndex - 1 + TOUR_TABS.length) % TOUR_TABS.length;
				break;
			case 'Home':
				event.preventDefault();
				nextIndex = 0;
				break;
			case 'End':
				event.preventDefault();
				nextIndex = TOUR_TABS.length - 1;
				break;
			default:
				return;
		}

		setActiveTab(TOUR_TABS[nextIndex].id);
	};

	return (
		<div {...reveal}>
			<LedgerRowHeader
				number={rowNumber}
				eyebrow={t('tour-eyebrow')}
				title={t('tour-title')}
				lede={t('tour-description')}
			/>

			{/* Desktop (≥768): tab strip + panel (§4 Row 04, padyna-10) */}
			<div className="hidden md:block">
				<div
					role="tablist"
					aria-label={t('tour-tablist-aria')}
					className="grid grid-cols-5 gap-px bg-(--publy-rule)"
				>
					{TOUR_TABS.map((tab, index) => {
						const isActive = tab.id === activeTab;
						return (
							<button
								key={tab.id}
								type="button"
								role="tab"
								id={`tour-tab-${tab.id}`}
								aria-selected={isActive}
								aria-controls={`tour-panel-${tab.id}`}
								tabIndex={isActive ? 0 : -1}
								data-active={isActive}
								onClick={() => setActiveTab(tab.id)}
								onKeyDown={handleTabKeyDown}
								className="ld07-cell group relative flex flex-col items-start gap-2 px-5 py-4 text-left data-[active=false]:bg-(--publy-surface-raised) data-[active=true]:bg-(--publy-background)"
							>
								<span
									aria-hidden="true"
									className="ld07-row-number text-(--publy-foreground-subtle)"
								>
									{String(index + 1).padStart(2, '0')}
								</span>
								<span className="flex items-center gap-2 text-[14px]/[22px] font-medium tracking-(--publy-tracking-text) text-(--publy-foreground-muted) group-data-[active=true]:text-(--publy-foreground)">
									{tab.icon}
									{t(tab.nameKey)}
								</span>
								<span
									aria-hidden="true"
									className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-(--publy-primary) transition-transform duration-[240ms] ease-(--publy-motion-ease) group-data-[active=true]:scale-x-100"
								/>
							</button>
						);
					})}
				</div>

				{TOUR_TABS.map((tab) => {
					const isActive = tab.id === activeTab;
					return (
						<div
							key={tab.id}
							id={`tour-panel-${tab.id}`}
							role="tabpanel"
							aria-labelledby={`tour-tab-${tab.id}`}
							hidden={!isActive}
							tabIndex={0}
							className="grid gap-px bg-(--publy-rule)"
						>
							<div className="bg-(--publy-background)">
								<MarketingImageSlot
									slot={`tour-${tab.id}`}
									subject={tab.subject}
									className={cn('w-full', TOUR_SLOT_HEIGHT)}
								/>
							</div>
							<div className="bg-(--publy-surface-raised) px-5 py-6 md:px-8 md:py-7">
								<h3 className="ld07-display-3 max-w-[28ch] text-balance">
									{t(tab.titleKey)}
								</h3>
								<p className="ld07-body mt-2 max-w-[62ch] text-(--publy-foreground-secondary)">
									{t(tab.descriptionKey)}
								</p>
							</div>
						</div>
					);
				})}
			</div>

			{/* Mobile (<768): the same five, as an accordion (§4 Row 04, padyna-11) */}
			<div className="md:hidden">
				{TOUR_TABS.map((tab) => {
					const isOpen = tab.id === activeTab;
					return (
						<div
							key={tab.id}
							className="border-b border-(--publy-rule) last:border-b-0"
						>
							<h3>
								<button
									type="button"
									aria-expanded={isOpen}
									aria-controls={`tour-accordion-panel-${tab.id}`}
									id={`tour-accordion-trigger-${tab.id}`}
									onClick={() => setActiveTab(tab.id)}
									className="flex w-full items-center justify-between gap-4 py-5 text-left"
								>
									<span className="flex items-center gap-2 text-[16px]/[26px] font-medium text-(--publy-foreground)">
										{tab.icon}
										{t(tab.nameKey)}
									</span>
									<IconChevronDown
										aria-hidden="true"
										className={cn(
											'size-5 shrink-0 text-(--publy-foreground-muted) transition-transform duration-300 ease-in-out',
											isOpen && 'rotate-180',
										)}
									/>
								</button>
							</h3>
							<div
								id={`tour-accordion-panel-${tab.id}`}
								role="region"
								aria-labelledby={`tour-accordion-trigger-${tab.id}`}
								data-open={isOpen}
								className="ld07-accordion-panel"
							>
								<div className="overflow-hidden">
									<div className="ld07-accordion-content pb-6">
										<MarketingImageSlot
											slot={`tour-${tab.id}`}
											subject={tab.subject}
											className={cn('w-full', TOUR_SLOT_HEIGHT)}
										/>
										<h4 className="ld07-display-3 mt-4 max-w-[28ch] text-balance">
											{t(tab.titleKey)}
										</h4>
										<p className="ld07-body mt-2 max-w-[62ch] text-(--publy-foreground-secondary)">
											{t(tab.descriptionKey)}
										</p>
									</div>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};
