import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { IconX } from '@tabler/icons-react';
import type * as React from 'react';
import { cn } from '~/lib/utils';

/**
 * Right-side drawer — the required surface for every non-confirmation
 * overlay (detail panels, invite flows, in-context create/edit, filters).
 * Centered modals are reserved for ConfirmDialog. Geometry lives in
 * app.css (`.publy-drawer*`) so the handoff values stay token-driven.
 */

export type DrawerSize = 'default' | 'filters';

function Drawer(props: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root {...props} />;
}

function DrawerTrigger(props: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerClose(props: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerContent({
	className,
	size = 'default',
	children,
	...props
}: DialogPrimitive.Popup.Props & { size?: DrawerSize }) {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Backdrop className="publy-overlay-backdrop z-[70] transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
			<DialogPrimitive.Popup
				data-slot="drawer"
				data-size={size}
				className={cn(
					'publy-drawer z-[71] outline-none transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform data-ending-style:translate-x-full data-starting-style:translate-x-full motion-reduce:transition-none',
					className,
				)}
				{...props}
			>
				{children}
			</DialogPrimitive.Popup>
		</DialogPrimitive.Portal>
	);
}

function DrawerHeader({
	className,
	children,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="drawer-header"
			className={cn('publy-drawer-header', className)}
			{...props}
		>
			<div className="flex min-w-0 flex-col gap-[3px]">{children}</div>
			<DialogPrimitive.Close
				aria-label="Close"
				className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--publy-radius-small-control)] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
			>
				<IconX className="size-[18px]" aria-hidden="true" />
			</DialogPrimitive.Close>
		</div>
	);
}

function DrawerTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return (
		<DialogPrimitive.Title
			data-slot="drawer-title"
			className={cn('publy-drawer-title', className)}
			{...props}
		/>
	);
}

function DrawerDescription({
	className,
	...props
}: DialogPrimitive.Description.Props) {
	return (
		<DialogPrimitive.Description
			data-slot="drawer-description"
			className={cn('publy-drawer-description', className)}
			{...props}
		/>
	);
}

function DrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="drawer-body"
			className={cn('publy-drawer-body', className)}
			{...props}
		/>
	);
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="drawer-footer"
			className={cn('publy-drawer-footer', className)}
			{...props}
		/>
	);
}

export {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
};
