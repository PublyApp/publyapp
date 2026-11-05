import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { IconX } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import type * as React from 'react';
import {
	FormProvider,
	type FieldValues,
	type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

/**
 * Right-side drawer — the required surface for every non-confirmation
 * overlay (detail panels, invite flows, in-context create/edit, filters).
 * Centered modals are reserved for ConfirmDialog. Geometry lives in
 * app.css (`.publy-drawer*`) so the handoff values stay token-driven.
 */

const Drawer = (props: DialogPrimitive.Root.Props) => {
	return <DialogPrimitive.Root {...props} />;
};

const DrawerTrigger = (props: DialogPrimitive.Trigger.Props) => {
	return <DialogPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
};

const DrawerClose = (props: DialogPrimitive.Close.Props) => {
	return <DialogPrimitive.Close data-slot="drawer-close" {...props} />;
};

type DrawerContentProps = DialogPrimitive.Popup.Props & {
	width?: 736;
};

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(',');

const focusableInside = (container: HTMLElement): HTMLElement[] =>
	[...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
		(element) =>
			element.getClientRects().length > 0 &&
			element.getAttribute('aria-hidden') !== 'true',
	);

/**
 * #2291 M5: Base UI's own trap can momentarily land focus on `<body>` at a
 * Tab-cycle boundary. This guard keeps the cycle inside the drawer: when the
 * browser would leave the popup (or focus is already outside it), it moves
 * focus to the first/last control itself. It defers whenever a nested dialog
 * is the topmost one, so the ConfirmDialog inside the invite drawer keeps its
 * own focus.
 */
const useDrawerFocusTrap = (
	popupRef: React.RefObject<HTMLDivElement | null>,
): void => {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Tab') {
				return;
			}

			const popup = popupRef.current;
			const openDialogs = [
				...document.querySelectorAll<HTMLElement>('[role="dialog"]'),
			].filter((dialog) => dialog.getClientRects().length > 0);

			if (!popup || openDialogs.at(-1) !== popup) {
				return;
			}

			// A nested dialog (the invite drawer's discard confirmation) owns
			// focus while it is open.
			const active = document.activeElement;
			if (active instanceof Element) {
				const activeDialog = active.closest('[role="dialog"]');
				if (activeDialog && activeDialog !== popup) {
					return;
				}
			}

			// Menus/comboboxes render in their own portal and own Tab while
			// open; yanking focus back into the drawer would break their
			// keyboard navigation.
			const popupOpen = [
				...document.querySelectorAll<HTMLElement>(
					'[role="menu"],[role="listbox"],[data-slot="select-content"],[data-slot="dropdown-menu-content"]',
				),
			].some((element) => element.getClientRects().length > 0);
			if (popupOpen) {
				return;
			}

			const focusables = focusableInside(popup);
			if (focusables.length === 0) {
				event.preventDefault();
				popup.focus();
				return;
			}

			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (!first || !last) {
				return;
			}
			const activeIndex = focusables.indexOf(
				document.activeElement as HTMLElement,
			);

			if (activeIndex === -1) {
				event.preventDefault();
				(event.shiftKey ? last : first).focus();
				return;
			}

			if (!event.shiftKey && activeIndex === focusables.length - 1) {
				event.preventDefault();
				first.focus();
				return;
			}

			if (event.shiftKey && activeIndex === 0) {
				event.preventDefault();
				last.focus();
			}
		};

		document.addEventListener('keydown', onKeyDown, true);
		return () => document.removeEventListener('keydown', onKeyDown, true);
	}, [popupRef]);
};

const DrawerContent = ({
	className,
	children,
	width,
	...props
}: DrawerContentProps) => {
	const popupRef = useRef<HTMLDivElement>(null);
	useDrawerFocusTrap(popupRef);

	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Backdrop className="publy-overlay-backdrop z-(--publy-z-overlay) transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
			<DialogPrimitive.Popup
				ref={popupRef}
				data-slot="drawer"
				data-width={width === undefined ? undefined : String(width)}
				className={cn(
					'publy-drawer z-(--publy-z-drawer-surface) outline-none transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:translate-x-full data-starting-style:translate-x-full motion-reduce:transition-none',
					className,
				)}
				{...props}
			>
				{children}
			</DialogPrimitive.Popup>
		</DialogPrimitive.Portal>
	);
};

const DrawerHeader = ({
	className,
	children,
	...props
}: React.ComponentProps<'div'>) => {
	const { t } = useTranslation('common');

	return (
		<div
			data-slot="drawer-header"
			className={cn('publy-drawer-header', className)}
			{...props}
		>
			<div className="flex min-w-0 flex-col gap-[3px]">{children}</div>
			<DialogPrimitive.Close
				aria-label={t('close')}
				className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--publy-radius-small-control)] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring"
			>
				<IconX className="size-[18px]" aria-hidden="true" />
			</DialogPrimitive.Close>
		</div>
	);
};

const DrawerTitle = ({ className, ...props }: DialogPrimitive.Title.Props) => {
	return (
		<DialogPrimitive.Title
			data-slot="drawer-title"
			className={cn('publy-drawer-title', className)}
			{...props}
		/>
	);
};

const DrawerDescription = ({
	className,
	...props
}: DialogPrimitive.Description.Props) => {
	return (
		<DialogPrimitive.Description
			data-slot="drawer-description"
			className={cn('publy-drawer-description', className)}
			{...props}
		/>
	);
};

const DrawerBody = ({ className, ...props }: React.ComponentProps<'div'>) => {
	return (
		<div
			data-slot="drawer-body"
			className={cn('publy-drawer-body', className)}
			{...props}
		/>
	);
};

const DrawerFooter = ({ className, ...props }: React.ComponentProps<'div'>) => {
	return (
		<div
			data-slot="drawer-footer"
			className={cn('publy-drawer-footer', className)}
			{...props}
		/>
	);
};

type DrawerFormProps<TFieldValues extends FieldValues = FieldValues> = {
	children: React.ReactNode;
	methods: UseFormReturn<TFieldValues>;
	onSubmit?: React.SubmitEventHandler<HTMLFormElement>;
	slotProps?: {
		form?: React.HTMLAttributes<HTMLFormElement>;
	};
};

/**
 * The drawer-owned `<form>` that carries a `DrawerBody` + `DrawerFooter`
 * pair. It renders the same react-hook-form surface as `Form`
 * (components/field) but applies `.publy-drawer-form` so the body becomes
 * the single scrolling region and the footer stays pinned — a plain `Form`
 * here is a block element in the drawer's flex column and clips the footer
 * below the viewport (fix/990). It keeps `Form`'s `space-y-4` inter-child
 * spacing: the fixed-footer geometry is the point of the change, the
 * ordinary-height spacing is not.
 */
const DrawerForm = <TFieldValues extends FieldValues = FieldValues>({
	children,
	methods,
	onSubmit,
	slotProps,
}: DrawerFormProps<TFieldValues>) => {
	return (
		<FormProvider {...methods}>
			<form
				{...slotProps?.form}
				onSubmit={onSubmit}
				noValidate
				autoComplete="off"
				className={cn(
					'space-y-4 publy-drawer-form',
					slotProps?.form?.className,
				)}
			>
				{children}
			</form>
		</FormProvider>
	);
};

export {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
};
