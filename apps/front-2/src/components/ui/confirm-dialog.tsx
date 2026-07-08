import { AlertDialog, Button } from '@heroui/react';
import { AlertTriangle } from 'lucide-react';

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
	<AlertDialog.Root isOpen={isOpen} onOpenChange={onOpenChange}>
		<AlertDialog.Backdrop />
		<AlertDialog.Container placement="center">
			<AlertDialog.Dialog>
				<AlertDialog.Header>
					<span
						className="publy-state-icon"
						data-tone={tone}
						aria-hidden="true"
					>
						<AlertTriangle className="size-6" />
					</span>
					<AlertDialog.Heading>{title}</AlertDialog.Heading>
				</AlertDialog.Header>
				<AlertDialog.Body>
					<p className="publy-type-helper">{description}</p>
				</AlertDialog.Body>
				<AlertDialog.Footer>
					<Button
						variant="ghost"
						isDisabled={isPending}
						onPress={() => onOpenChange(false)}
					>
						{cancelLabel}
					</Button>
					<Button
						variant={tone === 'danger' ? 'danger' : 'primary'}
						isDisabled={isPending}
						onPress={onConfirm}
					>
						{confirmLabel}
					</Button>
				</AlertDialog.Footer>
			</AlertDialog.Dialog>
		</AlertDialog.Container>
	</AlertDialog.Root>
);
