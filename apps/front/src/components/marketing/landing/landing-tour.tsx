import { IconArrowRight, IconChevronDown } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MarketingImageSlot } from '~/components/marketing/marketing-image-slot';
import { cn } from '~/lib/utils';

import { TOUR_TABS, type TourTabId } from './landing-tour-tabs';

/**
 * §2 — the product window, and the one object on the page allowed to break out
 * of the day and into the sky.
 *
 * IT COMES FIRST, AND THE TAB STRIP IS ITS TITLE BAR. Round one put a heading,
 * a dek and a five-up tab strip above the window, so the page's centrepiece
 * arrived fourth, ~230px below a heading that restated the hero. The window is
 * now the first thing under the dawn — nothing above it at all — and the five
 * surfaces are the tabs of its own chrome, which is both the truer metaphor
 * (they are views of one application, not five sections of a page) and what
 * lets the whole control stand above the horizon.
 *
 * THE GEOMETRY, AND WHY IT IS EXACT. The chrome is 48px and the rail beneath
 * it is 1px, so the window's head is 49px; the section pulls the window up by
 * exactly 49px (`.publy-landing-section-window`, `margin-block-start: -49px`).
 * The dawn's 1px bottom border therefore falls precisely on the rail — the
 * page's horizon and the tour's active-surface indicator are the SAME LINE.
 * Where the horizon passes behind the window it is one-fifth brand yellow, and
 * that fifth slides when you change tab. Nothing here is a measured constant:
 * every number is either the chrome's own height or a fifth of the strip.
 *
 * THE APERTURE HAS NO BACKGROUND, EVER. The field shows through it — the
 * dawn's last light at the top, paper below the horizon. Painting it
 * `--publy-surface` would make the page's centrepiece a 1104x621 blank white
 * rectangle, which is the grey plate the imagery ruling forbids, in white.
 *
 * Below the window: the section's own heading, then the active surface's copy.
 * Desktop drives the surface from the chrome's tab strip; below 768 the same
 * state is driven by an accordion of disclosure rows (padyna-11) whose own
 * body carries the description, so mobile and desktop never render the same
 * copy twice. Either control changes `activeTab`, which the aperture, the rail
 * and the copy block all read from — one state, three skins.
 *
 * SSR: `useState`'s initial value is the server-rendered surface, so the first
 * tab's copy and slot are present before hydration.
 */
export const LandingTour = () => {
	const { t } = useTranslation('landing');
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
			{/* The outer bracket + window: a second, unfilled, ring-only box
			    offset outside the window (todesktop-29's mounted-not-pasted
			    construction), then the window itself, ring + shadow-window,
			    exactly once on the page. Both rise through the horizon.

			    THE BRACKET IS RAISED, and it has to be. It is a sibling that
			    paints BEFORE the window, so the window's six-layer shadow
			    lands on top of it. In light mode those layers run 4-8% alpha
			    and nothing shows; in dark they run 30-55% of a near-black
			    tint, while `--publy-border` in that theme is a low-alpha
			    light hairline — so the line was being washed out exactly
			    where the shadow's downward offsets are strongest, which is
			    the bottom and right the owner reported. Raising it puts the
			    line above the wash. It cannot collide with the window's own
			    edge: the bracket is unfilled, `pointer-events-none`, and
			    every border it draws sits outside the window's box. */}
			<div className="relative">
				<div
					aria-hidden="true"
					className="publy-landing-radius-band publy-landing-bracket pointer-events-none absolute inset-0 -inset-x-1 -bottom-1 z-(--publy-z-raised) border-x-4 border-b-4 md:-inset-x-2 md:-bottom-2 md:border-x-8 md:border-b-8"
				/>
				<div
					className={cn(
						'publy-landing-ring publy-landing-shadow-window publy-sky-focus-in relative isolate overflow-hidden rounded-[var(--publy-radius-medium-control)]',
						ringPulsing && 'publy-landing-ring-strong',
					)}
					data-active-tab={activeTab}
				>
					{/* THE CHROME. 48px at every breakpoint — the negative margin
					    that lifts the window through the horizon is keyed to it,
					    so it may not become responsive. Above 768 it holds the
					    tab strip; below, where five tabs cannot fit, it holds the
					    active surface's name and the app URL and the accordion
					    below does the driving. */}
					<div className="flex h-12 items-stretch bg-(--publy-surface)">
						<div
							role="tablist"
							aria-label={t('landing-tour-tablist-aria')}
							className="hidden w-full md:flex"
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
											'publy-landing-pressable publy-landing-focus-ring flex flex-1 items-center justify-center gap-2 px-4',
											isActive
												? 'text-(--publy-foreground)'
												: 'text-(--publy-foreground-secondary)',
										)}
									>
										<tab.Icon className="size-4" aria-hidden="true" />
										<span className="publy-type-sky-label">
											{t(tab.labelKey)}
										</span>
									</button>
								);
							})}
						</div>
						<div className="flex w-full items-center justify-between gap-3 px-3 md:hidden">
							<span className="publy-type-sky-label text-(--publy-foreground)">
								{t(TOUR_TABS[activeIndex].labelKey)}
							</span>
							<span className="publy-type-sky-micro rounded-[var(--publy-radius-small-control)] border border-(--publy-border) px-2 py-1 text-(--publy-foreground-secondary)">
								{t('landing-hero-frame-url')}
							</span>
						</div>
					</div>
					{/* THE RAIL, WHICH IS ALSO THE HORIZON. 1px, the width of the
					    window, sitting exactly where the dawn's bottom border
					    falls. The indicator is a fifth of it in brand yellow and
					    translates by whole multiples of its own width. */}
					<div className="relative h-px w-full bg-(--publy-border)">
						<span
							aria-hidden="true"
							className="publy-landing-tour-rail-indicator absolute inset-y-0 left-0 w-1/5 bg-(--publy-primary)"
						/>
					</div>
					<div className="relative aspect-[4/3] w-full md:aspect-[16/9]">
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

			{/* The section's heading, below what it names. The window is shown
			    before it is announced; a reader who has just looked at the
			    product does not need a 48px promise above it, and putting the
			    heading here is what freed the top of the day for the window. */}
			<div className="publy-landing-section-body">
				<h2
					id="landing-tour-heading"
					className="publy-type-sky-display-2 publy-landing-optical-flush max-w-[24ch] text-balance text-(--publy-foreground)"
				>
					{t('landing-tour-title')}
				</h2>
				<p className="publy-type-sky-lead publy-landing-header-dek max-w-[52ch] text-pretty text-(--publy-foreground-secondary)">
					{t('landing-tour-description')}
				</p>
			</div>

			{/* Mobile accordion (padyna-11): a disclosure row per surface. Its
			    own label is always visible, its own description is the thing
			    that expands — so mobile never duplicates the desktop copy
			    block. */}
			<div className="publy-landing-section-body divide-y divide-(--publy-border) border-y border-(--publy-border) md:hidden">
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
								className="publy-landing-pressable publy-landing-focus-ring flex w-full items-center justify-between gap-3 py-4 text-start"
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
										'publy-landing-chevron size-5 shrink-0 text-(--publy-foreground-secondary)',
										isOpen && 'rotate-180',
									)}
								/>
							</button>
							<div
								id={`tour-accordion-panel-${tab.id}`}
								role="region"
								aria-labelledby={`tour-accordion-tab-${tab.id}`}
								className={cn(
									'publy-landing-accordion-panel',
									isOpen && 'publy-landing-accordion-panel-open',
								)}
							>
								<div className="publy-landing-accordion-panel-inner pb-4">
									<p className="publy-type-sky-body text-(--publy-foreground-secondary)">
										{t(tab.descriptionKey)}
									</p>
									<Link
										to="/signup"
										className="publy-landing-pressable publy-landing-focus-ring mt-4 inline-flex items-center gap-2 text-[15px] font-medium text-(--publy-foreground)"
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

			{/* The active tab's copy, desktop only — mobile carries the same
			    words inline in its open accordion row instead. The responsive
			    gate lives once on this wrapper; the per-tab `hidden` toggle
			    below stays a plain attribute so the two never fight over the
			    `display` property. */}
			<div className="publy-landing-section-body hidden md:block">
				{TOUR_TABS.map((tab, index) => (
					<div
						key={tab.id}
						id={`tour-panel-${tab.id}`}
						role="tabpanel"
						aria-labelledby={`tour-tab-${tab.id}`}
						hidden={index !== activeIndex}
						aria-hidden={index !== activeIndex}
					>
						<h3 className="publy-type-sky-display-4 max-w-[40ch] text-balance text-(--publy-foreground)">
							{t(tab.titleKey)}
						</h3>
						<p className="publy-type-sky-body mt-3 max-w-[66ch] text-pretty text-(--publy-foreground-secondary)">
							{t(tab.descriptionKey)}
						</p>
						<Link
							to="/signup"
							className="publy-landing-pressable publy-landing-focus-ring mt-4 inline-flex items-center gap-2 text-[15px] font-medium text-(--publy-foreground)"
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
