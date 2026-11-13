import { useId, useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
	FieldDropZone,
	type DropZoneFile,
} from '~/components/field/field-drop-zone';
import { renderFieldHelper } from '~/components/field/field-helper-text';
import { BrandTile } from '~/components/ui/initials-avatar';
import { Label } from '~/components/ui/label';
import { resolveApiFileUrl } from '~/lib/api-client/resolve-api-file-url';
import { formatBytes } from '~/lib/format-bytes';
import { useResponseMessageTranslator } from '~/lib/i18n/use-response-message-translator';
import { toastLocalMutationResult } from '~/lib/mutation-feedback/mutation-toast';
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

const fileNameOf = (url: string): string => {
	const last = url.split('?')[0]?.split('/').pop() ?? '';
	try {
		return decodeURIComponent(last);
	} catch {
		return last;
	}
};

export type FieldImageUploadProps = {
	name: string;
	label: string;
	previewName: string;
	helperText?: string;
	isDisabled?: boolean;
	/** The caller already shows the field's label in its own row. */
	hideLabel?: boolean;
	/** `optional` badge shown next to the stacked label. */
	optional?: boolean;
};

export const FieldImageUpload = ({
	name,
	label,
	previewName,
	helperText,
	isDisabled,
	hideLabel = false,
	optional = false,
}: FieldImageUploadProps) => {
	const { t, i18n } = useTranslation('common');
	const { control } = useFormContext();
	const translateResponseMessage = useResponseMessageTranslator();
	// The same value feeds the pre-check, its message and the drop hint, so the
	// limit reads one way everywhere (the API's refusal builds it from `maxBytes`).
	const maxSize = formatBytes(MAX_UPLOAD_BYTES, i18n.language, 'limit');
	const uploadImage = useUploadStaffImageMutation();
	const [localError, setLocalError] = useState('');
	const [picked, setPicked] = useState<DropZoneFile | null>(null);
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
					setPicked({
						name: file.name,
						meta: formatBytes(file.size, i18n.language),
					});

					if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
						setLocalError(t('logo-upload-invalid-type'));
						return;
					}

					if (file.size > MAX_UPLOAD_BYTES) {
						setLocalError(t('image-too-large', { size: maxSize }));
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
										translate: translateResponseMessage,
									}),
								);
							},
						},
					);
				};

				const hasUrl = currentUrl.trim().length > 0;
				const file: DropZoneFile | undefined = hasUrl
					? (picked ?? { name: fileNameOf(currentUrl), meta: '' })
					: undefined;

				return (
					<div className="flex flex-col gap-1.5">
						{hideLabel ? null : (
							<div className="flex items-center gap-2">
								<Label htmlFor={fieldId}>{label}</Label>
								{optional ? (
									<span className="text-xs text-muted-foreground">
										{t('optional')}
									</span>
								) : null}
							</div>
						)}
						<FieldDropZone
							kind="logo"
							title={t('organization-logo-title')}
							dropLabel={t('drop-file-here')}
							action={t('choose-image')}
							hint={
								<span>
									{t('or-drag-here')} · {t('logo-drop-hint', { size: maxSize })}
								</span>
							}
							inputId={fieldId}
							inputName={name}
							inputRef={field.ref}
							accept={ACCEPT_ATTR}
							file={isUploading ? undefined : file}
							thumb={
								file ? (
									<BrandTile
										name={previewName}
										logoUrl={currentUrl}
										className="size-9 shrink-0 rounded-[10px] text-xs"
									/>
								) : undefined
							}
							isDisabled={isControlDisabled}
							isBusy={isUploading}
							busyLabel={t('uploading-logo')}
							clearLabel={t('clear-logo')}
							testId="logo-upload-dropzone"
							onFiles={(fileList) => {
								const next = fileList?.[0];
								if (next) {
									acceptFile(next);
								}
							}}
							onClear={() => {
								field.onChange('');
								setPicked(null);
								setLocalError('');
							}}
							onBlur={field.onBlur}
						/>
						<span className="sr-only" data-testid="logo-upload-url">
							{currentUrl}
						</span>
						{renderFieldHelper({ helper, isInvalid, helperId })}
					</div>
				);
			}}
		/>
	);
};
