import { IconLoader2, IconX } from '@tabler/icons-react';
import { useId, useState, type ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { renderFieldHelper } from '~/components/field/field-helper-text';
import { Button } from '~/components/ui/button';
import { BrandTile } from '~/components/ui/initials-avatar';
import { Label } from '~/components/ui/label';
import { resolveApiFileUrl } from '~/lib/api-client/resolve-api-file-url';
import { useUploadStaffImageMutation } from '~/lib/query/staff-uploads';

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
	const fieldId = useId();
	const helperId = `${fieldId}-helper`;
	const isUploading = uploadImage.isPending;
	const isControlDisabled = Boolean(isDisabled) || isUploading;

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
								const url = result?.url;
								if (url) {
									field.onChange(resolveApiFileUrl(url));
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

				let statusContent: ReactNode;
				if (isUploading) {
					statusContent = (
						<p className="publy-type-helper flex items-center gap-1">
							<IconLoader2 aria-hidden="true" className="size-3 animate-spin" />
							{t('uploading-logo')}
						</p>
					);
				} else if (hasUrl) {
					statusContent = (
						<p
							className="truncate font-mono text-xs text-muted-foreground"
							data-testid="logo-upload-url"
							title={currentUrl}
						>
							{currentUrl}
						</p>
					);
				} else {
					statusContent = (
						<p className="publy-type-helper">{t('logo-upload-hint')}</p>
					);
				}

				const helperContent = renderFieldHelper({
					helper,
					isInvalid,
					helperId,
				});

				return (
					<div className="space-y-1.5">
						<Label htmlFor={fieldId}>{label}</Label>
						<div
							data-testid="logo-upload-dropzone"
							className="flex items-center gap-3 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-dashed border-(--publy-border-strong) bg-(--publy-surface-muted) px-4 py-3"
							onDragOver={(event) => {
								event.preventDefault();
							}}
							onDrop={(event) => {
								event.preventDefault();
								if (!isControlDisabled) {
									handleFiles(event.dataTransfer.files);
								}
							}}
						>
							<BrandTile
								name={previewName}
								logoUrl={hasUrl ? currentUrl : null}
								className="size-10 shrink-0 rounded-[10px] text-xs"
							/>
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<p className="text-[13px] text-foreground">
									{t('drag-image-here')}{' '}
									<label
										htmlFor={fieldId}
										className="cursor-pointer font-medium underline underline-offset-2"
									>
										{t('browse')}
									</label>
								</p>
								{statusContent}
							</div>
							{hasUrl && !isUploading ? (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={isControlDisabled}
									onClick={() => {
										field.onChange('');
										setLocalError('');
									}}
								>
									<IconX aria-hidden="true" className="size-3.5" />
									{t('clear-logo')}
								</Button>
							) : null}
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
						</div>
						{helperContent}
					</div>
				);
			}}
		/>
	);
};
