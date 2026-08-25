import { IconChevronDown, IconMenu2 } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import {
	useCallback,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '~/components/app-shell/theme/theme-toggle';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { cn } from '~/lib/utils';

import { MarketingBrand } from './marketing-brand';
import { MarketingContainer } from './marketing-container';
import {
	MARKETING_NAV_TRIGGERS,
	type MarketingNavTrigger,
	routedColumns,
	type RoutedMarketingNavColumn,
} from './marketing-nav';

/**
 * Hover intent (handoff: 120ms open / 180ms close). These are JS timer
 * budgets, not CSS transition durations — the handoff itself calls
 * the optional nav-intent-delay token optional for exactly that reason
 * ("hover-intent
 * is not a transition duration … drop it and hardcode if the token set
 * should stay smaller"). Keeping them as exported constants means the timing
 * has one home the tests can drive, instead of a CSS value JS would have to
 * read back out of `getComputedStyle`.
 */
export const MARKETING_NAV_INTENT_OPEN_DELAY_MS = 120;
export const MARKETING_NAV_INTENT_CLOSE_DELAY_MS = 180;

const panelId = (triggerId: string) => `marketing-mega-panel-${triggerId}`;

const MegaColumns = ({ columns }: { columns: RoutedMarketingNavColumn[] }) => {
	const { t } = useTranslation('common');

	return (
		<div
			className="publy-marketing-mega-grid publy-marketing-hairline-grid grid"
			data-columns={String(Math.min(columns.length, 3))}
		>
			{columns.map((column) => (
				<div key={column.id} className="flex flex-col gap-1 p-5">
					<p className="publy-marketing-eyebrow px-2 pb-1">
						{t(column.titleKey)}
					</p>
					{column.items.map((item) => {
						const Icon = item.Icon;

						return (
							<Link
								key={item.id}
								to={item.to}
								hash={item.hash}
								data-mega-link={item.id}
								className="flex items-start gap-3 rounded-[var(--publy-radius-small-control)] p-2 no-underline outline-none hover:bg-(--publy-surface-hover) focus-visible:ring-3 focus-visible:ring-ring"
							>
								<Icon
									aria-hidden="true"
									className="mt-0.5 size-[18px] shrink-0 text-(--publy-foreground-muted)"
								/>
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="flex items-center gap-2 text-sm font-medium text-foreground">
										{t(item.labelKey)}
										{item.badgeKey ? (
											<Badge variant="outline">{t(item.badgeKey)}</Badge>
										) : null}
									</span>
									<span className="text-[13px] leading-5 text-(--publy-foreground-muted)">
										{t(item.descriptionKey)}
									</span>
								</span>
							</Link>
						);
					})}
				</div>
			))}
		</div>
	);
};

type HeaderNavProps = {
	pathname: string;
	triggers: readonly MarketingNavTrigger[];
};

const DesktopNav = ({ pathname, triggers }: HeaderNavProps) => {
	const { t } = useTranslation('common');
	const [openTriggerId, setOpenTriggerId] = useState<string | null>(null);
	// Pathname the panel was opened on. The panel closes when the route
	// changes (derived below): TanStack `Link` does not unmount the header,
	// so an in-page anchor jump would otherwise leave the panel hanging open
	// over the section it just scrolled to.
	const [openedAtPathname, setOpenedAtPathname] = useState<string | null>(null);
	const navRef = useRef<HTMLDivElement | null>(null);
	const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const openByHoverRef = useRef(false);

	const clearTimers = useCallback(() => {
		if (openTimerRef.current !== null) {
			clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
		if (closeTimerRef.current !== null) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	const closeAndRestoreFocus = useCallback(
		(triggerId: string) => {
			clearTimers();
			setOpenTriggerId(null);
			setOpenedAtPathname(null);
			openByHoverRef.current = false;
			navRef.current
				?.querySelector<HTMLButtonElement>(`[data-nav-trigger='${triggerId}']`)
				?.focus();
		},
		[clearTimers],
	);

	const focusFirstPanelLink = (triggerId: string) => {
		// The panel mounts in the same commit as the state change, so the
		// query has to run after paint, not inline with the key handler.
		requestAnimationFrame(() => {
			navRef.current
				?.querySelector<HTMLAnchorElement>(
					`#${panelId(triggerId)} [data-mega-link]`,
				)
				?.focus();
		});
	};

	useEffect(() => clearTimers, [clearTimers]);

	// The panel is not portalled (it spans the header's own container), so a
	// click on the page behind it never passes through a backdrop — close on
	// any pointer press outside the nav instead.
	useEffect(() => {
		if (openTriggerId === null) {
			return;
		}

		const handlePointerDown = (event: MouseEvent) => {
			if (!navRef.current?.contains(event.target as Node)) {
				openByHoverRef.current = false;
				setOpenTriggerId(null);
			}
		};

		document.addEventListener('pointerdown', handlePointerDown);

		return () => document.removeEventListener('pointerdown', handlePointerDown);
	}, [openTriggerId]);

	// Closing the panel on navigation matters here: TanStack `Link` does not
	// unmount the header, so an in-page anchor jump would otherwise leave the
	// panel hanging open over the section it just scrolled to. Derived close:
	// the panel cannot outlive its opening route.
	if (openTriggerId !== null && openedAtPathname !== pathname) {
		setOpenTriggerId(null);
		setOpenedAtPathname(null);
	}

	const handleEscapeKey = useEffectEvent((event: KeyboardEvent) => {
		if (event.key !== 'Escape' || !openByHoverRef.current || !openTriggerId) {
			return;
		}

		const active = document.activeElement;
		const isActiveInNav = active !== null && navRef.current?.contains(active);
		const isActiveInModal =
			active instanceof Element &&
			active.closest('[role="dialog"], [aria-modal="true"]') !== null;

		if (isActiveInNav || isActiveInModal) {
			return;
		}

		closeAndRestoreFocus(openTriggerId);
	});

	useEffect(() => {
		document.addEventListener('keydown', handleEscapeKey);

		return () => document.removeEventListener('keydown', handleEscapeKey);
	}, []);

	const scheduleOpen = (triggerId: string) => {
		clearTimers();
		openTimerRef.current = setTimeout(() => {
			openByHoverRef.current = true;
			setOpenTriggerId(triggerId);
			setOpenedAtPathname(pathname);
		}, MARKETING_NAV_INTENT_OPEN_DELAY_MS);
	};

	const scheduleClose = () => {
		clearTimers();
		closeTimerRef.current = setTimeout(() => {
			openByHoverRef.current = false;
			setOpenTriggerId(null);
		}, MARKETING_NAV_INTENT_CLOSE_DELAY_MS);
	};

	return (
		<div
			ref={navRef}
			className="hidden items-center lg:flex"
			onMouseLeave={scheduleClose}
			onKeyDown={(event) => {
				// Escape closes from anywhere inside the nav — the trigger the
				// pointer opened, or any link inside the panel — and returns
				// focus to the trigger that owns the open panel.
				if (event.key === 'Escape' && openTriggerId !== null) {
					event.stopPropagation();
					closeAndRestoreFocus(openTriggerId);
				}
			}}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
					clearTimers();
					openByHoverRef.current = false;
					setOpenTriggerId(null);
				}
			}}
		>
			<nav
				aria-label={t('marketing-primary-navigation')}
				className="flex items-center gap-1"
			>
				{triggers.map((trigger) => {
					const columns = routedColumns(trigger.columns);
					const isOpen = openTriggerId === trigger.id;
					const isActive =
						trigger.to !== undefined &&
						trigger.hash === undefined &&
						pathname === trigger.to;

					// No routed mega items: the trigger degrades to the plain
					// link it already is, rather than opening an empty panel.
					if (columns.length === 0) {
						if (trigger.to === undefined) {
							return null;
						}

						return (
							<Link
								key={trigger.id}
								to={trigger.to}
								hash={trigger.hash}
								data-nav-link={trigger.id}
								data-active={isActive ? 'true' : undefined}
								className="publy-marketing-nav-link no-underline outline-none focus-visible:ring-3 focus-visible:ring-ring"
							>
								{t(trigger.labelKey)}
							</Link>
						);
					}

					return (
						<div
							key={trigger.id}
							className="flex items-center"
							onMouseEnter={() => scheduleOpen(trigger.id)}
						>
							<button
								type="button"
								id={`marketing-nav-trigger-${trigger.id}`}
								data-nav-trigger={trigger.id}
								aria-expanded={isOpen}
								aria-controls={isOpen ? panelId(trigger.id) : undefined}
								aria-haspopup="true"
								onClick={() => {
									clearTimers();
									openByHoverRef.current = false;
									if (isOpen) {
										setOpenedAtPathname(null);
									} else {
										setOpenedAtPathname(pathname);
									}
									setOpenTriggerId(isOpen ? null : trigger.id);
								}}
								onKeyDown={(event) => {
									if (event.key === 'ArrowDown') {
										event.preventDefault();
										clearTimers();
										openByHoverRef.current = false;
										setOpenedAtPathname(pathname);
										setOpenTriggerId(trigger.id);
										focusFirstPanelLink(trigger.id);
									}
								}}
								className="publy-marketing-nav-link cursor-pointer gap-1 outline-none focus-visible:ring-3 focus-visible:ring-ring"
							>
								{t(trigger.labelKey)}
								<IconChevronDown
									aria-hidden="true"
									className="size-4 transition-transform duration-(--publy-motion-fast)"
									data-open={isOpen ? 'true' : undefined}
								/>
							</button>
							{isOpen ? (
								// Rendered as the trigger's next sibling on purpose:
								// the panel is not portalled, so DOM order IS the tab
								// order — Tab off the trigger lands on the panel's
								// first link instead of skipping to the next trigger.
								<div
									id={panelId(trigger.id)}
									data-testid="marketing-mega-panel"
									data-panel-for={trigger.id}
									aria-labelledby={`marketing-nav-trigger-${trigger.id}`}
									onMouseEnter={clearTimers}
									className="publy-marketing-mega-panel absolute inset-x-0 top-full z-(--publy-z-menu) px-4 pt-2 sm:px-6"
								>
									<div className="mx-auto w-full max-w-(--publy-container-chrome) overflow-hidden rounded-[var(--publy-radius-control)] bg-(--publy-surface-raised) shadow-[var(--publy-shadow-menu)]">
										<MegaColumns columns={columns} />
									</div>
								</div>
							) : null}
						</div>
					);
				})}
			</nav>
		</div>
	);
};

export type MarketingHeaderProps = {
	pathname: string;
	onOpenMobileNav: () => void;
	/** The drawer is portalled and unmounted while closed, so the trigger can
	 *  only point `aria-controls` at it while it actually exists. */
	isMobileNavOpen?: boolean;
	/** Injectable for tests; production always uses the module's own model. */
	triggers?: readonly MarketingNavTrigger[];
};

/**
 * Marketing header (#1038).
 *
 * Static bottom hairline, no scroll elevation and no hide-on-scroll — a
 * header that moves while a mega panel is open is a usability risk, and the
 * permanent hairline matches the flat system. Chrome width; height comes from
 * `--publy-header-height` so the mega panel offset, the drawer inset and
 * in-page anchor `scroll-margin` can never drift from it.
 *
 * The breakpoint split is CSS-only (`lg:` = 1024), never a JS media query, so
 * the server renders both the desktop nav and the hamburger as real markup
 * and the correct one is already visible before hydration.
 */
export const MarketingHeader = ({
	pathname,
	onOpenMobileNav,
	isMobileNavOpen = false,
	triggers = MARKETING_NAV_TRIGGERS,
}: MarketingHeaderProps) => {
	const { t } = useTranslation('common');

	return (
		<header
			data-testid="marketing-header"
			className="sticky top-0 z-(--publy-z-shell-topbar) border-b border-(--publy-border) bg-(--publy-background)"
		>
			<MarketingContainer
				width="chrome"
				className="relative flex h-(--publy-header-height) items-center gap-4"
			>
				<MarketingBrand />
				<DesktopNav pathname={pathname} triggers={triggers} />
				<div className="ml-auto flex items-center gap-2">
					<ThemeToggle className="hidden lg:inline-flex" />
					{/* Fixed reservation (handoff: 244px): resolving auth status
					    later swaps these two controls for a single "Go to
					    dashboard" without reflowing the header around it. */}
					<div className="hidden min-w-[244px] items-center justify-end gap-2 lg:flex">
						<Link
							to="/login"
							className={cn(
								buttonVariants({ variant: 'ghost', size: 'sm' }),
								'no-underline',
							)}
						>
							{t('marketing-log-in')}
						</Link>
						<Link
							to="/signup"
							className={cn(
								buttonVariants({ variant: 'default', size: 'sm' }),
								'whitespace-nowrap no-underline',
							)}
						>
							{t('marketing-signup-cta')}
						</Link>
					</div>
					<Link
						to="/signup"
						className={cn(
							buttonVariants({ variant: 'default', size: 'sm' }),
							'whitespace-nowrap no-underline lg:hidden',
						)}
					>
						{t('marketing-signup-cta')}
					</Link>
					<Button
						variant="outline"
						// 36px squared, per the handoff's breakpoint table — the
						// `icon` size is exactly that, and already carries
						// --publy-radius-medium-control.
						size="icon"
						aria-label={t('marketing-open-menu')}
						aria-expanded={isMobileNavOpen}
						// Referencing an id that is not in the document is an
						// invalid ARIA value, not a harmless hint — axe fails it.
						aria-controls={isMobileNavOpen ? 'marketing-mobile-nav' : undefined}
						onClick={onOpenMobileNav}
						data-testid="marketing-mobile-nav-toggle"
						className="lg:hidden"
					>
						<IconMenu2 aria-hidden="true" className="size-[18px]" />
					</Button>
				</div>
			</MarketingContainer>
		</header>
	);
};
