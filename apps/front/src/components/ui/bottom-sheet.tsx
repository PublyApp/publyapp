import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

/**
 * A sheet that rises from the bottom of the screen below `md` (Shopkart OS
 * `bottom-sheet.tsx`): a real dialog — focus trapped, Escape and the backdrop
 * close it, a page scroll is locked. Mobile-native rule: menus and choice
 * lists are sheets on a phone, never anchored popovers.
 */
export const BottomSheet = ({
	open,
	onOpenChange,
	title,
	subtitle,
	trigger,
	children,
	className,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	subtitle?: string;
	trigger?: React.ReactElement;
	children: React.ReactNode;
	className?: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			{trigger ? <DialogPrimitive.Trigger render={trigger} /> : null}
			<DialogPrimitive.Portal>
				<DialogPrimitive.Backdrop
					forceRender
					className="fixed inset-0 z-(--publy-z-overlay) bg-[var(--publy-backdrop)] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0"
				/>
				<DialogPrimitive.Popup
					data-slot="bottom-sheet"
					aria-label={title}
					className={cn(
						'fixed inset-x-0 bottom-0 z-(--publy-z-drawer-surface) flex max-h-[80vh] flex-col rounded-t-[var(--publy-radius-control)] bg-background px-2 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))] text-foreground shadow-[var(--publy-shadow-drawer)] outline-none transition-transform duration-200 data-ending-style:translate-y-full data-starting-style:translate-y-full',
						className,
					)}
				>
					<div
						aria-hidden="true"
						className="mx-auto h-1 w-9 shrink-0 rounded-[2px] bg-border"
					/>
					<header className="flex shrink-0 items-start justify-between gap-2 px-2 pt-2 pb-1">
						<div className="flex min-w-0 flex-col gap-0.5">
							<DialogPrimitive.Title className="truncate text-[15px] font-semibold">
								{title}
							</DialogPrimitive.Title>
							{subtitle ? (
								<DialogPrimitive.Description className="text-xs text-muted-foreground">
									{subtitle}
								</DialogPrimitive.Description>
							) : null}
						</div>
						<DialogPrimitive.Close
							aria-label={t('close')}
							className="sr-only rounded-[var(--publy-radius-small-control)] focus-visible:not-sr-only focus-visible:flex focus-visible:size-9 focus-visible:items-center focus-visible:justify-center focus-visible:ring-2 focus-visible:ring-ring/50"
						>
							<IconX aria-hidden="true" className="size-5" />
						</DialogPrimitive.Close>
					</header>
					<div className="flex min-h-0 flex-col overflow-y-auto">
						{children}
					</div>
				</DialogPrimitive.Popup>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
};
