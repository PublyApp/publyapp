import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Button } from '~/components/ui/button';

export type ConfirmDialogProps = {
	isOpen: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	cancelLabel?: string;
	isPending?: boolean;
	tone?: 'danger' | 'primary';
	onConfirm: () => void;
	onOpenChange: (isOpen: boolean) => void;
};

export const ConfirmDialog = ({
	isOpen,
	title,
	description,
	confirmLabel,
	cancelLabel = 'Cancel',
	isPending = false,
	tone = 'danger',
	onConfirm,
	onOpenChange,
}: ConfirmDialogProps) => (
	<DialogPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
		<DialogPrimitive.Portal>
			<DialogPrimitive.Backdrop className="fixed inset-0 z-[70] bg-black/32 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none supports-backdrop-filter:backdrop-blur-sm" />
			<DialogPrimitive.Popup
				role="alertdialog"
				className="fixed top-1/2 left-1/2 z-[71] flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[28px] border border-border/70 bg-background/96 p-0 text-popover-foreground shadow-2xl outline-none transition duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity] data-ending-style:translate-y-[calc(-50%+1rem)] data-ending-style:opacity-0 data-starting-style:translate-y-[calc(-50%+1rem)] data-starting-style:opacity-0 motion-reduce:transition-none supports-backdrop-filter:backdrop-blur-xl"
			>
				<div className="px-6 pt-6 pb-4">
					<div className="mb-2 flex items-center gap-2">
						<span
							className="inline-flex size-6 items-center justify-center text-destructive"
							data-tone={tone}
							aria-hidden="true"
						>
							<IconAlertTriangle className="size-6" />
						</span>
						<DialogPrimitive.Title className="text-lg font-semibold text-foreground">
							{title}
						</DialogPrimitive.Title>
					</div>
					<DialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">
						{description}
					</DialogPrimitive.Description>
				</div>
				<div className="flex items-center justify-end gap-3 border-t border-border/70 px-6 py-4">
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						{cancelLabel}
					</Button>
					<Button
						type="button"
						variant={tone === 'danger' ? 'destructive' : 'default'}
						onClick={onConfirm}
						disabled={isPending}
					>
						{confirmLabel}
					</Button>
				</div>
			</DialogPrimitive.Popup>
		</DialogPrimitive.Portal>
	</DialogPrimitive.Root>
);
