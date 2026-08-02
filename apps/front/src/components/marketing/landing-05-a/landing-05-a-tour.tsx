import { IconArrowRight, IconChevronDown } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { cn } from '~/lib/utils';

import { TOUR_TABS, type TourTabId } from './landing-05-a-tour-tabs';

/**
 * §2 — the product window (todesktop-28 tab strip driving todesktop-29's
 * framed, empty slot). Desktop drives the active surface with a 5-up tab
 * strip plus a static translated rail (`hidden md:flex`/`hidden md:block`);
 * below 768 the same state is driven by an accordion of disclosure rows
 * (`md:hidden`, padyna-11) whose own body carries the description, so mobile
 * and desktop never render the same copy twice. Either control changes
 * `activeTab`, which the single aperture and the single desktop copy block
 * below the window both read from — one state, two skins.
 *
 * SSR: `useState`'s initial value is the server-rendered surface, so the
 * first tab's copy and slot are present before hydration.
 */
export const Landing05ATour = () => {
	const { t } = useTranslation('landing-05-a');
	const [activeTab, setActiveTab] = useState<TourTabId>('calendar');
	const [ringPulsing, setRingPulsing] = useState(false);
	const activeIndex = TOUR_TABS.findIndex((tab) => tab.id === activeTab);

	useEffect(() => {
		setRingPulsing(true);
		const timeout = setTimeout(() => setRingPulsing(false), 240);
		return () => clearTimeout(timeout);
	}, [activeTab]);

	const handleTourKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
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
		<div>
			<div className="text-center">
				<h2
					id="landing-05-a-tour-heading"
					className="publy-type-sky-display-2 text-balance text-(--publy-foreground)"
				>
					{t('landing-tour-title')}
				</h2>
				<p className="publy-type-sky-lead mx-auto mt-3 max-w-[52ch] text-pretty text-(--publy-foreground-secondary)">
					{t('landing-tour-description')}
				</p>
			</div>

			{/* Desktop tab strip + static progress rail (padyna-10's state model,
			    not todesktop-28's auto-advance — see §7 rejection). */}
			<div className="mt-8 hidden md:block">
				<div
					role="tablist"
					aria-label={t('landing-tour-tablist-aria')}
					className="flex divide-x divide-(--publy-border)"
				>
					{TOUR_TABS.map((tab) => {
						const isActive = tab.id === activeTab;
						return (
							<button
								key={tab.id}
								type="button"
								id={`tour-tab-${tab.id}`}
								role="tab"
								aria-selected={isActive}
								aria-controls={`tour-panel-${tab.id}`}
								tabIndex={isActive ? 0 : -1}
								onClick={() => setActiveTab(tab.id)}
								onKeyDown={handleTourKeyDown}
								className={cn(
									'publy-l05a-pressable publy-l05a-focus-ring flex flex-1 items-center justify-center gap-2 border-b px-6 py-4',
									isActive
										? 'border-b-transparent bg-(--publy-surface) text-(--publy-foreground)'
										: 'border-(--publy-border) text-(--publy-foreground-secondary)',
								)}
							>
								<tab.Icon className="size-5" aria-hidden="true" />
								<span className="publy-type-sky-label">{t(tab.labelKey)}</span>
							</button>
						);
					})}
				</div>
				<div
					data-active-tab={activeTab}
					className="relative h-px w-full bg-(--publy-border)"
				>
					<span
						aria-hidden="true"
						className="publy-l05a-tour-rail-indicator absolute inset-y-0 left-0 w-1/5 bg-(--publy-primary)"
					/>
				</div>
			</div>

			{/* Mobile accordion (padyna-11): a disclosure row per surface: its own
			    label is always visible, its own description is the thing that
			    expands — so mobile never duplicates the desktop copy block. */}
			<div className="mt-8 divide-y divide-(--publy-border) border-y border-(--publy-border) md:hidden">
				{TOUR_TABS.map((tab) => {
					const isOpen = tab.id === activeTab;
					return (
						<div key={tab.id}>
							<button
								type="button"
								id={`tour-accordion-tab-${tab.id}`}
								aria-expanded={isOpen}
								aria-controls={`tour-accordion-panel-${tab.id}`}
								onClick={() => setActiveTab(tab.id)}
								className="publy-l05a-pressable publy-l05a-focus-ring flex w-full items-center justify-between gap-3 px-4 py-4 text-start"
							>
								<span className="flex items-center gap-2">
									<tab.Icon
										className="size-5 text-(--publy-foreground-secondary)"
										aria-hidden="true"
									/>
									<span className="publy-type-sky-label text-(--publy-foreground)">
										{t(tab.labelKey)}
									</span>
								</span>
								<IconChevronDown
									aria-hidden="true"
									className={cn(
										'size-5 shrink-0 text-(--publy-foreground-secondary) transition-transform duration-300 ease-in-out',
										isOpen && 'rotate-180',
									)}
								/>
							</button>
							<div
								id={`tour-accordion-panel-${tab.id}`}
								role="region"
								aria-labelledby={`tour-accordion-tab-${tab.id}`}
								className={cn(
									'publy-l05a-accordion-panel',
									isOpen && 'publy-l05a-accordion-panel-open',
								)}
							>
								<div className="publy-l05a-accordion-panel-inner px-4 pb-4">
									<p className="publy-type-sky-body text-(--publy-foreground-secondary)">
										{t(tab.descriptionKey)}
									</p>
									<Link
										to="/signup"
										className="publy-l05a-pressable publy-l05a-focus-ring mt-4 inline-flex items-center gap-2 text-[15px] font-medium text-(--publy-foreground)"
									>
										{t('landing-tour-learn-more')}
										<IconArrowRight className="size-3.5" aria-hidden="true" />
									</Link>
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* The outer bracket + window: a second, unfilled, ring-only box
			    offset outside the window (todesktop-29's mounted-not-pasted
			    construction), then the window itself, ring + shadow-window,
			    exactly once on the page. */}
			<div className="relative mt-6 md:mt-0">
				<div
					aria-hidden="true"
					className="publy-l05a-radius-band pointer-events-none absolute inset-0 -inset-x-1.5 -bottom-1.5 border-x border-b border-(--publy-border) md:-inset-x-2.5 md:-bottom-2.5"
				/>
				<div
					className={cn(
						'publy-l05a-ring publy-l05a-shadow-window publy-sky-a-focus-in relative isolate overflow-hidden rounded-[var(--publy-radius-medium-control)] bg-(--publy-surface)',
						ringPulsing && 'publy-l05a-ring-strong',
					)}
				>
					<div className="flex h-10 items-center justify-between gap-3 border-b border-(--publy-border) bg-(--publy-surface) px-3">
						<span className="publy-l05a-eyebrow-chip text-xs font-medium normal-case tracking-normal">
							{t(TOUR_TABS[activeIndex].labelKey)}
						</span>
						<span className="publy-type-sky-micro rounded-[var(--publy-radius-small-control)] border border-(--publy-border) px-2 py-1 text-(--publy-foreground-secondary)">
							{t('landing-hero-frame-url')}
						</span>
						<span className="size-9 shrink-0" aria-hidden="true" />
					</div>
					<div className="relative aspect-[4/3] w-full md:aspect-[16/10]">
						{TOUR_TABS.map((tab, index) => (
							<div
								key={tab.id}
								hidden={index !== activeIndex}
								aria-hidden={index !== activeIndex}
								className="absolute inset-0"
							>
								<MarketingImageSlot
									slot={tab.slot}
									subject={tab.slotSubject}
									alt={t(tab.altKey)}
									className="h-full w-full"
								/>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* The active tab's copy, desktop only — mobile carries the same
			    words inline in its open accordion row instead. The responsive
			    gate lives once on this wrapper; the per-tab `hidden` toggle
			    below stays a plain attribute so the two never fight over the
			    `display` property. */}
			<div className="mt-8 hidden text-center md:block">
				{TOUR_TABS.map((tab, index) => (
					<div
						key={tab.id}
						id={`tour-panel-${tab.id}`}
						role="tabpanel"
						aria-labelledby={`tour-tab-${tab.id}`}
						hidden={index !== activeIndex}
						aria-hidden={index !== activeIndex}
					>
						<h3 className="publy-type-sky-display-3 text-balance text-(--publy-foreground)">
							{t(tab.titleKey)}
						</h3>
						<p className="publy-type-sky-lead mx-auto mt-3 max-w-[52ch] text-pretty text-(--publy-foreground-secondary)">
							{t(tab.descriptionKey)}
						</p>
						<Link
							to="/signup"
							className="publy-l05a-pressable publy-l05a-focus-ring mt-4 inline-flex items-center gap-2 text-[15px] font-medium text-(--publy-foreground)"
						>
							{t('landing-tour-learn-more')}
							<IconArrowRight className="size-3.5" aria-hidden="true" />
						</Link>
					</div>
				))}
			</div>
		</div>
	);
};
