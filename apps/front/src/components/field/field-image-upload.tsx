import {
	IconLoader2,
	IconPhotoUp,
	IconTrash,
	IconUpload,
} from '@tabler/icons-react';
import { useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { renderFieldHelper } from '~/components/field/field-helper-text';
import { Button } from '~/components/ui/button';
import { BrandTile } from '~/components/ui/initials-avatar';
import { Label } from '~/components/ui/label';
import { resolveApiFileUrl } from '~/lib/api-client/resolve-api-file-url';
import { toastLocalMutationResult } from '~/lib/mutation-feedback/mutation-toast';
import { useUploadStaffImageMutation } from '~/lib/query/staff-uploads';
import { cn } from '~/lib/utils';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { MAX_UPLOAD_BYTES } from '@org/shared-ts/lib/constants';

/** Mirrors the server's accepted image types (apps/api/Lib/AppEnvironment.cs)
 * as a client-side courtesy check — the server stays authoritative and
 * re-validates by magic-byte sniffing. */
const ACCEPTED_MIME_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
];
const ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(',');

export type FieldImageUploadProps = {
	name: string;
	label: string;
	previewName: string;
	helperText?: string;
	isDisabled?: boolean;
};

export const FieldImageUpload = ({
	name,
	label,
	previewName,
	helperText,
	isDisabled,
}: FieldImageUploadProps) => {
	const { t } = useTranslation('common');
	const { control } = useFormContext();
	const uploadImage = useUploadStaffImageMutation();
	const [localError, setLocalError] = useState('');
	const [isDragOver, setIsDragOver] = useState(false);
	const fieldId = useId();
	const helperId = `${fieldId}-helper`;
	const isUploading = uploadImage.isPending;
	const isControlDisabled = Boolean(isDisabled) || isUploading;
	const surface = cn(
		'group/drop cursor-pointer border-[1.5px] border-dashed border-input bg-[color-mix(in_srgb,var(--foreground)_6%,var(--background))] outline-none transition-[background-color,border-color,box-shadow] duration-150',
		'hover:border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--foreground)_9%,var(--background))]',
		'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
		isDragOver &&
			'border-solid border-primary bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]',
	);

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const currentUrl = typeof field.value === 'string' ? field.value : '';
				const helper = error?.message || localError || helperText;
				const isInvalid = Boolean(error) || localError.length > 0;

				const acceptFile = (file: File) => {
					setLocalError('');

					if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
						setLocalError(t('logo-upload-invalid-type'));
						return;
					}

					if (file.size > MAX_UPLOAD_BYTES) {
						setLocalError(t('logo-upload-too-large'));
						return;
					}

					uploadImage.mutate(
						{ file },
						{
							onSuccess: (result) => {
								const url = result?.url?.trim();
								if (url) {
									field.onChange(resolveApiFileUrl(url));
									toastLocalMutationResult.success(t('image-uploaded-success'));
								} else {
									setLocalError(t('logo-upload-failed'));
								}
							},
							onError: (uploadError) => {
								setLocalError(
									getFailureMessage(toApiFailure(uploadError), {
										fallback: t('logo-upload-failed'),
									}),
								);
							},
						},
					);
				};

				const handleFiles = (fileList: FileList | null) => {
					const file = fileList?.[0];
					if (file) {
						acceptFile(file);
					}
				};

				const hasUrl = currentUrl.trim().length > 0;

				const helperContent = renderFieldHelper({
					helper,
					isInvalid,
					helperId,
				});

				if (hasUrl && !isUploading) {
					return (
						<div className="space-y-1.5">
							<Label htmlFor={fieldId}>{label}</Label>
							<div className="flex items-center gap-3 rounded-[12px] border bg-background px-3 py-2.5">
								<BrandTile
									name={previewName}
									logoUrl={currentUrl}
									className="size-9 shrink-0 rounded-[10px] text-xs"
								/>
								<span className="flex min-w-0 flex-col">
									<span
										className="truncate text-sm font-medium"
										title={currentUrl}
										data-testid="logo-upload-url"
									>
										{currentUrl}
									</span>
									<span className="text-xs text-muted-foreground">
										{t('logo-upload-hint')}
									</span>
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="ml-auto"
									disabled={isControlDisabled}
									aria-label={t('clear-logo')}
									onClick={() => {
										field.onChange('');
										setLocalError('');
									}}
								>
									<IconTrash aria-hidden="true" className="size-4" />
								</Button>
							</div>
							{helperContent}
							<input
								id={fieldId}
								ref={field.ref}
								name={field.name}
								type="file"
								accept={ACCEPT_ATTR}
								aria-label={label}
								className="sr-only"
								disabled={isControlDisabled}
								onBlur={field.onBlur}
								onChange={(event) => {
									handleFiles(event.target.files);
									event.target.value = '';
								}}
							/>
						</div>
					);
				}

				if (isUploading) {
					return (
						<div className="space-y-1.5">
							<Label htmlFor={fieldId}>{label}</Label>
							<div className="flex items-center gap-3 rounded-[12px] border bg-background px-3 py-2.5">
								<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
									<IconLoader2
										aria-hidden="true"
										className="size-5 animate-spin text-muted-foreground"
									/>
								</span>
								<span className="text-sm text-muted-foreground">
									{t('uploading-logo')}
								</span>
							</div>
							{helperContent}
							<input
								id={fieldId}
								ref={field.ref}
								name={field.name}
								type="file"
								accept={ACCEPT_ATTR}
								aria-label={label}
								className="sr-only"
								disabled
								tabIndex={-1}
								onBlur={field.onBlur}
								onChange={(event) => {
									handleFiles(event.target.files);
									event.target.value = '';
								}}
							/>
						</div>
					);
				}

				return (
					<div className="space-y-1.5">
						<div className="flex items-center gap-2">
							<Label htmlFor={fieldId}>{label}</Label>
							<span className="text-xs text-muted-foreground">
								{t('optional')}
							</span>
						</div>
						<label
							htmlFor={fieldId}
							data-testid="logo-upload-dropzone"
							aria-disabled={isControlDisabled || undefined}
							className={cn(
								'flex flex-col items-center gap-1.5 rounded-[14px] px-4 py-3.5 text-center',
								surface,
								isControlDisabled && 'pointer-events-none opacity-60',
							)}
							onDragOver={(event) => {
								event.preventDefault();
								if (!isControlDisabled) {
									setIsDragOver(true);
								}
							}}
							onDragLeave={() => setIsDragOver(false)}
							onDrop={(event) => {
								event.preventDefault();
								setIsDragOver(false);
								if (!isControlDisabled) {
									handleFiles(event.dataTransfer.files);
								}
							}}
						>
							<span className="flex items-center gap-2">
								<span className="flex size-7 items-center justify-center rounded-lg bg-background shadow-raised-control">
									{isDragOver ? (
										<IconUpload aria-hidden="true" className="size-3.5" />
									) : (
										<IconPhotoUp aria-hidden="true" className="size-3.5" />
									)}
								</span>
								<span className="text-[13px] font-semibold">
									{isDragOver
										? t('drop-file-here')
										: t('organization-logo-title')}
								</span>
							</span>
							<span
								aria-hidden="true"
								className="pointer-events-none inline-flex h-7 items-center gap-1.5 rounded-[var(--publy-radius-small-control)] border bg-background px-2.5 text-xs font-medium shadow-sm"
							>
								<IconUpload aria-hidden="true" data-icon="inline-start" />
								{t('choose-image')}
							</span>
							<span className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted-foreground transition-colors group-hover/drop:text-foreground">
								<span>
									{t('or-drag-here')} · {t('logo-upload-hint')}
								</span>
							</span>
							<input
								id={fieldId}
								ref={field.ref}
								name={field.name}
								type="file"
								accept={ACCEPT_ATTR}
								aria-label={label}
								aria-invalid={isInvalid || undefined}
								aria-describedby={helper ? helperId : undefined}
								disabled={isControlDisabled}
								className="sr-only"
								onBlur={field.onBlur}
								onChange={(event) => {
									handleFiles(event.target.files);
									event.target.value = '';
								}}
							/>
						</label>
						{helperContent}
					</div>
				);
			}}
		/>
	);
};
