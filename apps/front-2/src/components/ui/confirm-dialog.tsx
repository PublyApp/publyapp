import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

/**
 * Centered modals are reserved for confirmation dialogs (handoff 2e):
 * 480px, radius 28, blurred backdrop, ghost cancel + soft-destructive
 * confirm. Every other overlay must use the right-side Drawer.
 */
export type ConfirmDialogProps = {
	isOpen: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	cancelLabel?: string;
	isPending?: boolean;
	isConfirmDisabled?: boolean;
	tone?: 'danger' | 'primary';
	/** Extra confirmation content (user inset card, type-to-confirm field). */
	children?: ReactNode;
	onConfirm: () => void;
	onOpenChange: (isOpen: boolean) => void;
};

export const ConfirmDialog = ({
	isOpen,
	title,
	description,
	confirmLabel,
	cancelLabel,
	isPending = false,
	isConfirmDisabled = false,
	tone = 'danger',
	children,
	onConfirm,
	onOpenChange,
}: ConfirmDialogProps) => {
	const { t } = useTranslation('common');
	const resolvedCancelLabel = cancelLabel ?? t('cancel');

	return (
		<DialogPrimitive.Root
			open={isOpen}
			disablePointerDismissal={isPending}
			onOpenChange={(next) => {
				if (isPending && !next) {
					return;
				}
				onOpenChange(next);
			}}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop className="publy-overlay-backdrop z-(--publy-z-overlay) transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none supports-backdrop-filter:backdrop-blur-sm" />
				<DialogPrimitive.Popup
					role="alertdialog"
					data-slot="confirm-dialog"
					data-tone={tone}
					className="fixed top-1/2 left-1/2 z-(--publy-z-drawer-surface) flex w-[min(480px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--publy-modal-radius)] border border-border/70 bg-(--publy-overlay-surface) p-0 text-popover-foreground shadow-[var(--publy-shadow-modal)] outline-none transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity] data-ending-style:translate-y-[calc(-50%+1rem)] data-ending-style:opacity-0 data-starting-style:translate-y-[calc(-50%+1rem)] data-starting-style:opacity-0 motion-reduce:transition-none"
				>
					<div
						className={
							children
								? 'flex items-start justify-between gap-3 px-6 pt-5'
								: 'flex items-start justify-between gap-3 px-6 pt-5 pb-5'
						}
					>
						<div className="flex min-w-0 flex-col gap-1">
							<DialogPrimitive.Title
								data-slot="confirm-dialog-title"
								className="text-[17px] font-semibold text-foreground"
							>
								{title}
							</DialogPrimitive.Title>
							<DialogPrimitive.Description className="text-[13px] text-muted-foreground">
								{description}
							</DialogPrimitive.Description>
						</div>
						<DialogPrimitive.Close
							aria-label={t('close')}
							disabled={isPending}
							className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--publy-radius-small-control)] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						>
							<IconX className="size-[18px]" aria-hidden="true" />
						</DialogPrimitive.Close>
					</div>
					{children ? (
						<div className="flex flex-col gap-3.5 px-6 pt-4 pb-5">
							{children}
						</div>
					) : null}
					<div
						data-slot="confirm-dialog-footer"
						className="flex items-center justify-end gap-2.5 border-t border-[color:var(--publy-row-border)] px-6 py-3.5"
					>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							disabled={isPending}
						>
							{resolvedCancelLabel}
						</Button>
						<Button
							type="button"
							variant={tone === 'danger' ? 'destructive' : 'default'}
							className="font-semibold"
							onClick={onConfirm}
							disabled={isPending || isConfirmDisabled}
						>
							{confirmLabel}
						</Button>
					</div>
				</DialogPrimitive.Popup>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
};
