import {
	IconFileCheck,
	IconFileSpreadsheet,
	IconLoader2,
	IconPhotoUp,
	IconTrash,
	IconUpload,
} from '@tabler/icons-react';
import { useState, type DragEvent, type ReactNode, type Ref } from 'react';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

/**
 * The prototype's drop zone (`drop-zone.tsx`, the « Carte » shape — the
 * prototype's default): a dashed surface greyer than the rows around it, a
 * raised icon tile, the field's title, an outline action and the hint. The
 * whole zone is the file control (a `<label>` over a visually hidden
 * `<input type="file">`), so a click, Enter or Space opens the picker; a real
 * drag turns it solid primary with « Déposez le fichier ici ». Once a file is
 * chosen it becomes the chosen-file bar (thumbnail or icon, name, details,
 * remove).
 */

export type DropZoneKind = 'logo' | 'csv';
export type DropZoneFile = { name: string; meta: string };

const KIND_ICON = {
	logo: IconPhotoUp,
	csv: IconFileSpreadsheet,
} as const;

const SURFACE = cn(
	'group/drop flex cursor-pointer flex-col items-center gap-1.5 rounded-[var(--publy-radius-control)] px-4 py-3.5 text-center',
	'border-[1.5px] border-dashed border-(--publy-dropzone-border) bg-[color-mix(in_srgb,var(--foreground)_6%,var(--background))] outline-none transition-[background-color,border-color,box-shadow] duration-150',
	'hover:border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--foreground)_9%,var(--background))]',
	'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
);

const DRAG_OVER =
	'border-solid border-primary bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]';

export const FieldDropZone = ({
	kind,
	title,
	dropLabel,
	action,
	hint,
	inputId,
	inputName,
	inputRef,
	accept,
	file,
	thumb,
	isDisabled,
	isBusy,
	busyLabel,
	clearLabel,
	testId,
	template,
	onFiles,
	onClear,
	onBlur,
}: {
	kind: DropZoneKind;
	title: string;
	/** What the title becomes while a file is dragged over the zone. */
	dropLabel: string;
	action: string;
	hint: ReactNode;
	inputId: string;
	inputName?: string;
	inputRef?: Ref<HTMLInputElement>;
	accept: string;
	file?: DropZoneFile;
	/** What stands for the file once chosen (the logo's image/initials tile). */
	thumb?: ReactNode;
	isDisabled?: boolean;
	isBusy?: boolean;
	busyLabel?: string;
	clearLabel: string;
	testId?: string;
	/** A template-download action shown after the hint (the CSV import). */
	template?: ReactNode;
	onFiles: (files: FileList | null) => void;
	onClear: () => void;
	onBlur?: () => void;
}) => {
	const [over, setOver] = useState(false);
	const Icon = KIND_ICON[kind];

	const drag = {
		onDragOver: (event: DragEvent) => {
			event.preventDefault();
			if (!isDisabled) {
				setOver(true);
			}
		},
		onDragLeave: () => setOver(false),
		onDrop: (event: DragEvent) => {
			event.preventDefault();
			setOver(false);
			if (!isDisabled) {
				onFiles(event.dataTransfer.files);
			}
		},
	};

	if (isBusy) {
		return (
			<div
				className="flex items-center gap-3 rounded-[var(--publy-radius-medium-control)] border bg-background px-3 py-2.5"
				data-testid={testId ? `${testId}-busy` : undefined}
			>
				<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
					<IconLoader2
						aria-hidden="true"
						className="size-5 animate-spin text-muted-foreground"
					/>
				</span>
				<span className="text-sm text-muted-foreground">{busyLabel}</span>
				<input
					id={inputId}
					name={inputName}
					ref={inputRef}
					type="file"
					accept={accept}
					aria-label={action}
					className="sr-only"
					disabled
					tabIndex={-1}
					onChange={(event) => {
						onFiles(event.target.files);
						event.target.value = '';
					}}
				/>
			</div>
		);
	}

	if (file) {
		return (
			<div
				className="flex items-center gap-3 rounded-[var(--publy-radius-medium-control)] border bg-background px-3 py-2.5"
				data-testid={testId ? `${testId}-chosen` : undefined}
			>
				{thumb ?? (
					<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-(--publy-success)">
						<IconFileCheck aria-hidden="true" className="size-5" />
					</span>
				)}
				<span className="flex min-w-0 flex-col">
					<span className="truncate text-sm font-medium">{file.name}</span>
					<span className="text-xs text-muted-foreground">{file.meta}</span>
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="ml-auto rounded-[var(--publy-radius-control)]"
					aria-label={clearLabel}
					disabled={isDisabled}
					onClick={onClear}
				>
					<IconTrash />
				</Button>
				<input
					id={inputId}
					name={inputName}
					ref={inputRef}
					type="file"
					accept={accept}
					aria-label={action}
					className="sr-only"
					disabled={isDisabled}
					onBlur={onBlur}
					onChange={(event) => {
						onFiles(event.target.files);
						event.target.value = '';
					}}
				/>
			</div>
		);
	}

	return (
		<label
			htmlFor={inputId}
			data-testid={testId}
			aria-disabled={isDisabled || undefined}
			className={cn(
				SURFACE,
				over && DRAG_OVER,
				isDisabled && 'pointer-events-none opacity-60',
			)}
			{...drag}
		>
			<input
				id={inputId}
				name={inputName}
				ref={inputRef}
				type="file"
				accept={accept}
				aria-label={action}
				className="sr-only"
				disabled={isDisabled}
				onBlur={onBlur}
				onChange={(event) => {
					onFiles(event.target.files);
					event.target.value = '';
				}}
			/>
			<span className="flex items-center gap-2">
				<span className="flex size-7 items-center justify-center rounded-lg bg-background shadow-[var(--publy-shadow-ring)]">
					{over ? (
						<IconUpload aria-hidden="true" className="size-3.5" />
					) : (
						<Icon className="size-3.5" aria-hidden="true" />
					)}
				</span>
				<span className="text-[13px] font-semibold">
					{over ? dropLabel : title}
				</span>
			</span>
			<span
				aria-hidden="true"
				className="pointer-events-none inline-flex h-7 items-center gap-1.5 rounded-[var(--publy-radius-small-control)] border bg-background px-2.5 text-xs font-medium shadow-sm"
			>
				<IconUpload aria-hidden="true" data-icon="inline-start" />
				{action}
			</span>
			<span className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted-foreground transition-colors group-hover/drop:text-foreground">
				{hint}
				{template}
			</span>
		</label>
	);
};
