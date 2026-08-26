import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { IconChevronRight, IconCheck } from '@tabler/icons-react';
import * as React from 'react';
import { Checkbox } from '~/components/ui/checkbox';
import { cn } from '~/lib/utils';

const DropdownMenu = ({ ...props }: MenuPrimitive.Root.Props) => {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
};

const DropdownMenuPortal = ({ ...props }: MenuPrimitive.Portal.Props) => {
	return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
};

const DropdownMenuTrigger = ({ ...props }: MenuPrimitive.Trigger.Props) => {
	return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
};

const DropdownMenuContent = ({
	align = 'start',
	alignOffset = 0,
	side = 'bottom',
	sideOffset = 4,
	className,
	...props
}: MenuPrimitive.Popup.Props &
	Pick<
		MenuPrimitive.Positioner.Props,
		'align' | 'alignOffset' | 'side' | 'sideOffset'
	>) => {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className="isolate z-(--publy-z-menu) outline-none"
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
			>
				<MenuPrimitive.Popup
					data-slot="dropdown-menu-content"
					className={cn(
						'z-(--publy-z-menu) max-h-(--available-height) min-w-[196px] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[var(--publy-radius-control)] border border-border/90 bg-popover/97 p-[5px] text-popover-foreground shadow-[var(--publy-shadow-menu)] backdrop-blur-sm duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95',
						className,
					)}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
};

const DropdownMenuGroup = ({ ...props }: MenuPrimitive.Group.Props) => {
	return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
};

const DropdownMenuLabel = ({
	className,
	inset,
	...props
}: MenuPrimitive.GroupLabel.Props & {
	inset?: boolean;
}) => {
	return (
		<MenuPrimitive.GroupLabel
			data-slot="dropdown-menu-label"
			data-inset={inset}
			className={cn(
				'px-3 py-2.5 text-xs text-muted-foreground data-inset:pl-9.5',
				className,
			)}
			{...props}
		/>
	);
};

const DropdownMenuItem = ({
	className,
	inset,
	variant = 'default',
	...props
}: MenuPrimitive.Item.Props & {
	inset?: boolean;
	variant?: 'default' | 'destructive';
}) => {
	return (
		<MenuPrimitive.Item
			data-slot="dropdown-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(
				"group/dropdown-menu-item relative flex h-8 cursor-default items-center gap-2 rounded-[var(--publy-radius-menu-item)] px-2.5 text-[13px] text-foreground outline-hidden select-none focus:bg-muted data-highlighted:bg-muted data-inset:pl-9.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px] [&_svg]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive",
				className,
			)}
			{...props}
		/>
	);
};

const DropdownMenuSub = ({ ...props }: MenuPrimitive.SubmenuRoot.Props) => {
	return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
};

const DropdownMenuSubTrigger = ({
	className,
	inset,
	children,
	...props
}: MenuPrimitive.SubmenuTrigger.Props & {
	inset?: boolean;
}) => {
	return (
		<MenuPrimitive.SubmenuTrigger
			data-slot="dropdown-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"flex h-8 cursor-default items-center gap-2 rounded-[var(--publy-radius-menu-item)] px-2.5 text-[13px] text-foreground outline-hidden select-none focus:bg-muted data-inset:pl-9.5 data-popup-open:bg-muted data-open:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[15px] [&_svg]:text-muted-foreground",
				className,
			)}
			{...props}
		>
			{children}
			<IconChevronRight className="ml-auto" />
		</MenuPrimitive.SubmenuTrigger>
	);
};

const DropdownMenuSubContent = ({
	align = 'start',
	alignOffset = -3,
	side = 'right',
	sideOffset = 0,
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuContent>) => {
	return (
		<DropdownMenuContent
			data-slot="dropdown-menu-sub-content"
			className={cn(
				'w-auto min-w-36 rounded-[var(--publy-radius-control)] border border-border/90 bg-popover/97 p-[5px] text-popover-foreground shadow-[var(--publy-shadow-menu)] backdrop-blur-sm duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className,
			)}
			align={align}
			alignOffset={alignOffset}
			side={side}
			sideOffset={sideOffset}
			{...props}
		/>
	);
};

const DropdownMenuCheckboxItem = ({
	className,
	children,
	checked,
	inset,
	showCheckbox = false,
	...props
}: MenuPrimitive.CheckboxItem.Props & {
	inset?: boolean;
	/** Renders a visible, always-present checkbox at the row end instead of
	 * the checked-only indicator — use for genuine multi-select filters
	 * (`closeOnClick={false}`), never for exclusive/radio-style filter items. */
	showCheckbox?: boolean;
}) => {
	return (
		<MenuPrimitive.CheckboxItem
			data-slot="dropdown-menu-checkbox-item"
			data-inset={inset}
			className={cn(
				"relative flex h-8 cursor-default items-center gap-2.5 rounded-[var(--publy-radius-menu-item)] pl-3 text-[13px] text-foreground outline-hidden select-none focus:bg-muted data-highlighted:bg-muted data-inset:pl-9.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				showCheckbox ? 'pr-3' : 'pr-8',
				className,
			)}
			checked={checked}
			{...props}
		>
			{showCheckbox ? (
				<>
					<span className="flex flex-1 items-center gap-2.5">{children}</span>
					<Checkbox
						data-slot="dropdown-menu-checkbox-item-box"
						checked={checked}
						readOnly
						tabIndex={-1}
						aria-hidden="true"
						className="pointer-events-none shrink-0"
					/>
				</>
			) : (
				<>
					<span
						className="pointer-events-none absolute right-2 flex items-center justify-center"
						data-slot="dropdown-menu-checkbox-item-indicator"
					>
						<MenuPrimitive.CheckboxItemIndicator>
							<IconCheck />
						</MenuPrimitive.CheckboxItemIndicator>
					</span>
					{children}
				</>
			)}
		</MenuPrimitive.CheckboxItem>
	);
};

const DropdownMenuRadioGroup = ({
	...props
}: MenuPrimitive.RadioGroup.Props) => {
	return (
		<MenuPrimitive.RadioGroup
			data-slot="dropdown-menu-radio-group"
			{...props}
		/>
	);
};

const DropdownMenuRadioItem = ({
	className,
	children,
	inset,
	...props
}: MenuPrimitive.RadioItem.Props & {
	inset?: boolean;
}) => {
	return (
		<MenuPrimitive.RadioItem
			data-slot="dropdown-menu-radio-item"
			data-inset={inset}
			className={cn(
				"relative flex h-8 cursor-default items-center gap-2.5 rounded-[var(--publy-radius-menu-item)] pr-8 pl-3 text-[13px] text-foreground outline-hidden select-none focus:bg-muted data-highlighted:bg-muted data-inset:pl-9.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			<span
				className="pointer-events-none absolute right-2 flex items-center justify-center"
				data-slot="dropdown-menu-radio-item-indicator"
			>
				<MenuPrimitive.RadioItemIndicator>
					<IconCheck />
				</MenuPrimitive.RadioItemIndicator>
			</span>
			{children}
		</MenuPrimitive.RadioItem>
	);
};

const DropdownMenuSeparator = ({
	className,
	...props
}: MenuPrimitive.Separator.Props) => {
	return (
		<MenuPrimitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn('-mx-1.5 my-1.5 h-px bg-border/50', className)}
			{...props}
		/>
	);
};

export {
	DropdownMenu,
	DropdownMenuPortal,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
};
