import { IconChevronDown } from '@tabler/icons-react';
import { Fragment, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME } from '~/components/table/floating-selection-bar';
import { Button } from '~/components/ui/button';
import {
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utils';

/**
 * The selection bar's bulk-actions trigger + menu (WCAG 2.5.3 "label in
 * name", #1400).
 *
 * The trigger's accessible name and its visible label are THE SAME TEXT: one
 * `triggerLabel` prop feeds both, sourced by every caller from the single
 * `bulk-actions` i18n key — so the screen-reader announcement can never
 * drift away from what sighted users read (#1400's defect was a separate
 * `aria-label="More actions"` under a visible "Bulk actions" on all four
 * list pages). When the selection exceeds the bulk-action cap, the cap
 * explanation rides on `title` (an accessible description), never competing
 * with the name.
 *
 * Menu items always render (docs/guides/bulk-action-ux-conventions.md):
 * eligibility is enforced at click time by the caller's handler, not by
 * hiding or disabling items. A separator renders before the first
 * destructive item when safe actions precede it — the shape every
 * selection-bar menu shares today.
 */
type BulkActionMenuItem<TKey extends string = string> = {
	/** Stable action identity handed back to `onMenuItemClick`. */
	key: TKey;
	label: ReactNode;
	icon: ReactNode;
	variant?: 'default' | 'destructive';
	disabled?: boolean;
};

const BulkActionsTrigger = ({
	triggerLabel,
	isOverLimit = false,
	overLimitMessage,
	className,
	...restProps
}: {
	/**
	 * Visible text AND accessible name — the same string by construction.
	 * Rendered as the button's visible label and mirrored onto `aria-label`
	 * so the name can never diverge from what sighted users read (#1400).
	 */
	triggerLabel: string;
	isOverLimit?: boolean;
	/** Title tooltip shown while the selection exceeds the bulk-action cap. */
	overLimitMessage?: string;
	className?: string;
} & Omit<ComponentPropsWithoutRef<'button'>, 'aria-label' | 'children'>) => (
	<DropdownMenuTrigger
		render={
			<Button
				type="button"
				variant="ghost"
				size="sm"
				disabled={isOverLimit}
				title={isOverLimit ? overLimitMessage : undefined}
				aria-label={triggerLabel}
				className={cn(
					FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME,
					className,
				)}
				{...restProps}
			/>
		}
	>
		{triggerLabel}
		<IconChevronDown aria-hidden="true" className="size-3" />
	</DropdownMenuTrigger>
);

const BulkActionsMenu = <TKey extends string>({
	items,
	onMenuItemClick,
}: {
	items: readonly BulkActionMenuItem<TKey>[];
	onMenuItemClick: (key: TKey) => void;
}) => {
	const firstDestructiveIndex = items.findIndex(
		(item) => item.variant === 'destructive',
	);

	return (
		<DropdownMenuContent align="end" side="top" sideOffset={6}>
			{items.map((item, index) => (
				<Fragment key={item.key}>
					{index === firstDestructiveIndex && index > 0 ? (
						<DropdownMenuSeparator />
					) : null}
					<DropdownMenuItem
						variant={item.variant}
						disabled={item.disabled}
						onClick={() => {
							if (item.disabled) {
								return;
							}
							onMenuItemClick(item.key);
						}}
					>
						{item.icon}
						{item.label}
					</DropdownMenuItem>
				</Fragment>
			))}
		</DropdownMenuContent>
	);
};

export { BulkActionsTrigger, BulkActionsMenu };
export type { BulkActionMenuItem };
