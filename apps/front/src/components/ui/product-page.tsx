import type { TablerIcon } from '@tabler/icons-react';
import { Link, type LinkProps } from '@tanstack/react-router';
import { createElement, useId, type ReactNode } from 'react';
import { cn } from '~/lib/utils';

import { Button } from './button';
import { buttonVariants } from './button.variants';
import { SpeedDial, type SpeedDialAction } from './speed-dial';

/**
 * A page's primary action, declared as data so the same page renders it as
 * the desktop button and as a mobile speed-dial action. Exactly one of `to`
 * (a route link, still a real anchor on desktop) or `onSelect` is provided.
 */
export type PageAction = {
	label: string;
	icon: TablerIcon;
	to?: LinkProps['to'];
	params?: LinkProps['params'];
	onSelect?: () => void;
	/** Desktop button variant; the mobile tile is always the neutral one. */
	variant?: 'default' | 'outline';
	/** Optional stable selector for the desktop control. */
	testId?: string;
};

/** Kept out of the JSX so the icon's `data-icon` (the Button's padding
 * hook) survives its type: an object variable is not excess-checked. */
const ACTION_GLYPH_PROPS = {
	'aria-hidden': true,
	'data-icon': 'inline-start',
} as const;

const PageActionButton = ({
	action,
	linkId,
}: {
	action: PageAction;
	/** The real anchor's id, so the mobile action can click it and keep the
	 * router's own navigation (no second navigation path). */
	linkId?: string;
}) => {
	const variant = action.variant ?? 'default';
	// createElement, not <Icon />: the drawer-description guard cannot
	// attribute a JSX tag bound to a parameter (list-page's FilterGlyph).
	const glyph = createElement(action.icon, ACTION_GLYPH_PROPS);
	if (action.to === undefined) {
		return (
			<Button
				variant={variant}
				onClick={action.onSelect}
				data-testid={action.testId}
			>
				{glyph}
				{action.label}
			</Button>
		);
	}
	return (
		<Link
			id={linkId}
			to={action.to}
			params={action.params}
			data-testid={action.testId}
			className={cn(buttonVariants({ variant }))}
		>
			{glyph}
			{action.label}
		</Link>
	);
};

/**
 * The page header's action cluster: leading desktop actions (`children`), the
 * primary action data, trailing desktop chrome (`trailing`), and the mobile
 * speed-dial. Below `md` the desktop buttons are hidden and the speed-dial
 * carries them, export on top and the primary action nearest the button.
 * Trailing chrome (the statistics chevron) is not an action and stays in the
 * header on every width.
 */
export const PageActions = ({
	children,
	action,
	trailing,
	speedDialActions,
	speedDialLabel,
}: {
	children?: ReactNode;
	action?: PageAction;
	trailing?: ReactNode;
	speedDialActions?: readonly SpeedDialAction[];
	speedDialLabel?: string;
}) => {
	// The desktop control is the action's real anchor; the mobile tile clicks
	// it so navigation stays the router's own (no second navigate path).
	const linkId = useId();
	const primary: SpeedDialAction | undefined =
		action === undefined
			? undefined
			: {
					id: action.testId ?? action.label,
					label: action.label,
					icon: action.icon,
					onSelect: () => {
						if (action.onSelect) {
							action.onSelect();
							return;
						}
						document.getElementById(linkId)?.click();
					},
				};
	const dialActions = [
		...(speedDialActions ?? []),
		...(primary ? [primary] : []),
	];

	return (
		<div className="publy-action-cluster">
			{children}
			{action ? (
				<span className="max-md:hidden">
					<PageActionButton action={action} linkId={linkId} />
				</span>
			) : null}
			{trailing}
			{dialActions.length > 0 ? (
				<SpeedDial
					label={speedDialLabel ?? dialActions[dialActions.length - 1].label}
					actions={dialActions}
				/>
			) : null}
		</div>
	);
};

// Under md the actions drop below the title (Shopkart's PageTitle): a 390px
// row cannot hold « Organisations » and the action cluster side by side
// without the buttons painting over the title (#2280).
export const PageHeader = ({
	title,
	description,
	actions,
	action,
	trailingActions,
	speedDialActions,
	speedDialLabel,
	count,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
	/** The page's primary action as data: desktop button + speed-dial action. */
	action?: PageAction;
	/** Desktop-only chrome after the primary action (the statistics chevron). */
	trailingActions?: ReactNode;
	/** Extra speed-dial actions rendered above the primary one (export). */
	speedDialActions?: readonly SpeedDialAction[];
	/** Accessible label of the multi-action speed-dial button. */
	speedDialLabel?: string;
	/** Count badge rendered beside the title inside a shared flex wrapper. */
	count?: ReactNode;
}) => (
	<header className="publy-page-header max-md:flex-col max-md:items-stretch">
		<div className="min-w-0">
			{count ? (
				<div className="flex items-center gap-2.5">
					<h1 className="publy-type-page-title">{title}</h1>
					{count}
				</div>
			) : (
				<h1 className="publy-type-page-title">{title}</h1>
			)}
			{description ? (
				// `text-muted-foreground` overrides `.publy-type-helper`'s subtle
				// token: #a1a1aa on the page surface is 2.39:1, below WCAG AA for
				// 12px body text (the redesign's page descriptions exposed it).
				<p className="publy-type-helper mt-1 text-muted-foreground">
					{description}
				</p>
			) : null}
		</div>
		{actions ||
		action ||
		trailingActions ||
		(speedDialActions?.length ?? 0) > 0 ? (
			<PageActions
				action={action}
				trailing={trailingActions}
				speedDialActions={speedDialActions}
				speedDialLabel={speedDialLabel}
			>
				{actions}
			</PageActions>
		) : null}
	</header>
);

export const StatusPill = ({
	children,
	tone = 'neutral',
	testId,
}: {
	children: ReactNode;
	tone?: 'danger' | 'info' | 'neutral' | 'primary' | 'success' | 'warning';
	/** Optional test-id passthrough so consumers can pin a stable selector
	 * without wrapping the pill (mirrors the pattern used by other product
	 * primitives such as PageHeader). */
	testId?: string;
}) => (
	<span className="publy-status-pill" data-tone={tone} data-testid={testId}>
		{children}
	</span>
);

export const DetailRow = ({
	label,
	value,
}: {
	label: string;
	value: ReactNode;
}) => (
	<div className="publy-detail-row">
		<div className="publy-type-metadata-label">{label}</div>
		<div className="publy-type-metadata-value">{value}</div>
	</div>
);

export const PillTabs = ({ children }: { children: ReactNode }) => (
	<div className="publy-pill-tabs">{children}</div>
);
