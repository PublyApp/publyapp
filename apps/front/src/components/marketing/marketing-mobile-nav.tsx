import { IconChevronDown } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeToggle } from '~/components/app-shell/theme/theme-toggle';
import { Badge } from '~/components/ui/badge';
import { buttonVariants } from '~/components/ui/button.variants';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { cn } from '~/lib/utils';

import {
	MARKETING_NAV_TRIGGERS,
	type MarketingNavTrigger,
	routedColumns,
} from './marketing-nav';

/**
 * Mobile navigation (#1038): a right-side drawer, kept all the way through
 * `md` — the switch to the mega menu happens at `lg` (1024), because a
 * half-width mega panel at 768 is worse than a drawer. Focus trapping, `Esc`
 * to close and the body scroll lock come from the `Drawer` primitive's Base
 * UI dialog, not from a hand-rolled trap.
 *
 * Same nav model as the mega menu, re-rendered as an accordion; every row is
 * at least 44px tall.
 */
export const MarketingMobileNav = ({
	open,
	onOpenChange,
	triggers = MARKETING_NAV_TRIGGERS,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	triggers?: readonly MarketingNavTrigger[];
}) => {
	const { t } = useTranslation('common');
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const close = () => onOpenChange(false);

	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent
				id="marketing-mobile-nav"
				data-testid="marketing-mobile-nav"
			>
				<DrawerHeader>
					<DrawerTitle>{t('marketing-menu')}</DrawerTitle>
				</DrawerHeader>
				<DrawerBody className="flex flex-col gap-1">
					<nav
						aria-label={t('marketing-mobile-navigation')}
						className="flex flex-col gap-1"
					>
						{triggers.map((trigger) => {
							const columns = routedColumns(trigger.columns);
							const items = columns.flatMap((column) => column.items);
							const isExpanded = expandedId === trigger.id;

							if (items.length === 0) {
								if (trigger.to === undefined) {
									return null;
								}

								return (
									<Link
										key={trigger.id}
										to={trigger.to}
										hash={trigger.hash}
										onClick={close}
										data-nav-link={trigger.id}
										className="flex min-h-11 items-center rounded-[var(--publy-radius-small-control)] px-3 text-sm font-medium text-foreground no-underline outline-none hover:bg-(--publy-surface-hover) focus-visible:ring-3 focus-visible:ring-ring"
									>
										{t(trigger.labelKey)}
									</Link>
								);
							}

							return (
								<div key={trigger.id} className="flex flex-col">
									<button
										type="button"
										data-nav-accordion={trigger.id}
										aria-expanded={isExpanded}
										aria-controls={`marketing-mobile-section-${trigger.id}`}
										onClick={() =>
											setExpandedId(isExpanded ? null : trigger.id)
										}
										className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-[var(--publy-radius-small-control)] px-3 text-sm font-medium text-foreground outline-none hover:bg-(--publy-surface-hover) focus-visible:ring-3 focus-visible:ring-ring"
									>
										{t(trigger.labelKey)}
										<IconChevronDown
											aria-hidden="true"
											className="size-4 text-(--publy-foreground-muted)"
											data-open={isExpanded ? 'true' : undefined}
										/>
									</button>
									{isExpanded ? (
										<div
											id={`marketing-mobile-section-${trigger.id}`}
											className="flex flex-col gap-1 pb-2 pl-3"
										>
											{items.map((item) => (
												<Link
													key={item.id}
													to={item.to}
													hash={item.hash}
													onClick={close}
													data-mega-link={item.id}
													className="flex min-h-11 items-center gap-2 rounded-[var(--publy-radius-small-control)] px-3 text-sm text-(--publy-foreground-secondary) no-underline outline-none hover:bg-(--publy-surface-hover) focus-visible:ring-3 focus-visible:ring-ring"
												>
													{t(item.labelKey)}
													{item.badgeKey ? (
														<Badge variant="outline">{t(item.badgeKey)}</Badge>
													) : null}
												</Link>
											))}
										</div>
									) : null}
								</div>
							);
						})}
					</nav>
					<div className="mt-2 flex items-center justify-between gap-3 border-t border-(--publy-border) pt-4">
						<span className="text-sm font-medium text-foreground">
							{t('marketing-appearance')}
						</span>
						<ThemeToggle />
					</div>
				</DrawerBody>
				<DrawerFooter className="flex flex-col gap-2">
					<Link
						to="/login"
						onClick={close}
						className={cn(
							buttonVariants({ variant: 'outline', size: 'lg' }),
							'w-full no-underline',
						)}
					>
						{t('marketing-log-in')}
					</Link>
					<Link
						to="/signup"
						onClick={close}
						className={cn(
							buttonVariants({ variant: 'default', size: 'lg' }),
							'w-full no-underline',
						)}
					>
						{t('marketing-signup-cta')}
					</Link>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
};
