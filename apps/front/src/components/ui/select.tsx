import { Select as SelectPrimitive } from '@base-ui/react/select';
import {
	IconSelector,
	IconCheck,
	IconChevronUp,
	IconChevronDown,
} from '@tabler/icons-react';
import * as React from 'react';
import { cn } from '~/lib/utils';

const Select = SelectPrimitive.Root;

const SelectValue = ({ className, ...props }: SelectPrimitive.Value.Props) => {
	return (
		<SelectPrimitive.Value
			data-slot="select-value"
			className={cn('flex flex-1 text-left', className)}
			{...props}
		/>
	);
};

const SelectTrigger = ({
	className,
	size = 'default',
	children,
	...props
}: SelectPrimitive.Trigger.Props & {
	size?: 'sm' | 'default';
}) => {
	return (
		<SelectPrimitive.Trigger
			data-slot="select-trigger"
			data-size={size}
			className={cn(
				"flex w-fit items-center justify-between gap-1.5 rounded-[var(--publy-radius-input)] border border-border bg-input/50 px-3 py-2 text-[13px] whitespace-nowrap shadow-[var(--publy-shadow-input)] transition-[color,box-shadow,background-color] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 dark:aria-invalid:focus-visible:border-destructive dark:aria-invalid:focus-visible:ring-destructive/40 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon
				render={
					<IconSelector className="pointer-events-none size-4 text-muted-foreground" />
				}
			/>
		</SelectPrimitive.Trigger>
	);
};

const SelectContent = ({
	className,
	children,
	side = 'bottom',
	sideOffset = 4,
	// r3 F13: matches DropdownMenuContent's own default — a popup wider than
	// its trigger (e.g. the page-size select's 28px trigger) hangs from one
	// edge instead of overhanging symmetrically on both sides.
	align = 'start',
	alignOffset = 0,
	alignItemWithTrigger = false,
	...props
}: SelectPrimitive.Popup.Props &
	Pick<
		SelectPrimitive.Positioner.Props,
		'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
	>) => {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Positioner
				side={side}
				sideOffset={sideOffset}
				align={align}
				alignOffset={alignOffset}
				alignItemWithTrigger={alignItemWithTrigger}
				className="isolate z-(--publy-z-select)"
			>
				<SelectPrimitive.Popup
					data-slot="select-content"
					data-align-trigger={alignItemWithTrigger}
					className={cn(
						'relative isolate z-(--publy-z-select) max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[var(--publy-radius-control)] border border-border/90 bg-popover/97 text-popover-foreground shadow-[var(--publy-shadow-menu)] backdrop-blur-sm duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
						className,
					)}
					{...props}
				>
					<SelectScrollUpButton />
					<SelectPrimitive.List>{children}</SelectPrimitive.List>
					<SelectScrollDownButton />
				</SelectPrimitive.Popup>
			</SelectPrimitive.Positioner>
		</SelectPrimitive.Portal>
	);
};

const SelectItem = ({
	className,
	children,
	...props
}: SelectPrimitive.Item.Props) => {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			className={cn(
				"relative flex h-8 w-full cursor-default items-center gap-2 rounded-[var(--publy-radius-menu-item)] py-0 pr-8 pl-2.5 text-[13px] text-foreground outline-hidden select-none focus:bg-muted data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				className,
			)}
			{...props}
		>
			<SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
				{children}
			</SelectPrimitive.ItemText>
			<SelectPrimitive.ItemIndicator
				render={
					<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
				}
			>
				<IconCheck className="pointer-events-none" />
			</SelectPrimitive.ItemIndicator>
		</SelectPrimitive.Item>
	);
};

const SelectScrollUpButton = ({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) => {
	return (
		<SelectPrimitive.ScrollUpArrow
			data-slot="select-scroll-up-button"
			className={cn(
				"top-0 z-(--publy-z-raised) flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			<IconChevronUp />
		</SelectPrimitive.ScrollUpArrow>
	);
};

const SelectScrollDownButton = ({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) => {
	return (
		<SelectPrimitive.ScrollDownArrow
			data-slot="select-scroll-down-button"
			className={cn(
				"bottom-0 z-(--publy-z-raised) flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			<IconChevronDown />
		</SelectPrimitive.ScrollDownArrow>
	);
};

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
