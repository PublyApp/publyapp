import {
	IconDownload,
	IconFileCheck,
	IconFileSpreadsheet,
	IconPlus,
	IconTrash,
	IconUpload,
	IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

import { type TranslateFn } from './_tenant-form-shared';
import { MemberLevelSelect } from './_tenants-new-fields';
import {
	downloadTemplateCsv,
	type useTenantMemberImport,
} from './_tenants-new-import';
import { getUserLevel } from './_tenants-new-schema';
import { type TenantCreateFormValues } from './_tenants-new-types';
import { type buildMemberImportOutcome } from './tenants-new-helpers';

type ImportOutcome = ReturnType<typeof buildMemberImportOutcome>;
type MemberImport = ReturnType<typeof useTenantMemberImport>;

const MemberImportDropzone = ({
	t,
	fileInputRef,
	onFiles,
	isDisabled,
}: {
	t: TranslateFn;
	fileInputRef: MemberImport['fileInputRef'];
	onFiles: (files: FileList | null) => void;
	isDisabled?: boolean;
}) => {
	const [isDragOver, setIsDragOver] = useState(false);
	const surface = cn(
		'group/drop border-[1.5px] border-dashed border-input bg-[color-mix(in_srgb,var(--foreground)_6%,var(--background))] outline-none transition-[background-color,border-color,box-shadow] duration-150',
		'hover:border-[color-mix(in_srgb,var(--foreground)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--foreground)_9%,var(--background))]',
		'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
		isDragOver &&
			'border-solid border-primary bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))] hover:border-primary hover:bg-[color-mix(in_srgb,var(--primary)_14%,var(--background))]',
	);
	return (
		<div
			className={cn(
				'relative flex flex-col items-center gap-1.5 rounded-[14px] px-4 py-3.5 text-center',
				surface,
				isDisabled && 'pointer-events-none opacity-60',
			)}
			data-testid="tenant-member-dropzone"
			onDragOver={(event) => {
				event.preventDefault();
				if (!isDisabled) {
					setIsDragOver(true);
				}
			}}
			onDragLeave={() => setIsDragOver(false)}
			onDrop={(event) => {
				event.preventDefault();
				setIsDragOver(false);
				if (!isDisabled) {
					onFiles(event.dataTransfer.files);
				}
			}}
		>
			<input
				ref={fileInputRef}
				id="tenant-member-file-input"
				type="file"
				accept=".csv"
				aria-label={t('choose-csv-file-aria')}
				className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
				disabled={isDisabled}
				onChange={(event) => {
					onFiles(event.target.files);
					event.target.value = '';
				}}
			/>
			<span className="pointer-events-none flex items-center gap-2">
				<span className="flex size-7 items-center justify-center rounded-lg bg-background shadow-raised-control">
					{isDragOver ? (
						<IconUpload aria-hidden="true" className="size-3.5" />
					) : (
						<IconFileSpreadsheet aria-hidden="true" className="size-3.5" />
					)}
				</span>
				<span className="text-[13px] font-semibold">
					{isDragOver ? t('drop-file-here') : t('import-members-title')}
				</span>
			</span>
			<span
				aria-hidden="true"
				className="pointer-events-none inline-flex h-7 items-center gap-1.5 rounded-[var(--publy-radius-small-control)] border bg-background px-2.5 text-xs font-medium shadow-sm"
			>
				<IconUpload aria-hidden="true" data-icon="inline-start" />
				{t('choose-csv-file')}
			</span>
			<span className="pointer-events-none flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted-foreground transition-colors group-hover/drop:text-foreground">
				<span>
					{t('or-drag-here')} · {t('csv-columns-hint')}
				</span>
				<button
					type="button"
					className="pointer-events-auto relative inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-sm text-xs font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
					onClick={(event) => {
						event.stopPropagation();
						downloadTemplateCsv();
					}}
				>
					<IconDownload aria-hidden="true" className="size-3.5" />
					{t('download-template')}
				</button>
			</span>
		</div>
	);
};

const MemberImportSummary = ({
	t,
	fileName,
	outcome,
	onRemove,
}: {
	t: TranslateFn;
	fileName: string;
	outcome: ImportOutcome;
	onRemove: () => void;
}) => (
	<div
		className="flex items-center gap-3 rounded-[12px] border bg-background px-3 py-2.5"
		data-testid="tenant-member-parsed-summary"
	>
		<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-[var(--status-resolved-foreground)]">
			<IconFileCheck aria-hidden="true" className="size-5" />
		</span>
		<span className="flex min-w-0 flex-col">
			<span className="truncate text-sm font-medium">{fileName}</span>
			<span className="text-xs text-muted-foreground">
				{t('parsed-file-summary', {
					detected: outcome.detectedCount,
					valid: outcome.valid.length,
				})}
				{outcome.invalidCount > 0
					? ` · ${t('parsed-file-invalid-rows', { count: outcome.invalidCount })}`
					: ''}
				{outcome.duplicateCount > 0
					? ` · ${t('parsed-file-duplicate-rows', { count: outcome.duplicateCount })}`
					: ''}
			</span>
		</span>
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			className="ml-auto"
			aria-label={t('remove')}
			onClick={onRemove}
		>
			<IconTrash aria-hidden="true" className="size-4" />
		</Button>
	</div>
);

export const TenantCreateMembersSection = ({
	t,
	control,
	isFormLocked,
	memberImport,
	manualMemberFields,
	canAddManualMember,
	onAddManualMember,
	onRemoveManualMember,
}: {
	t: TranslateFn;
	control: Control<TenantCreateFormValues>;
	isFormLocked: boolean;
	memberImport: MemberImport;
	manualMemberFields: { id: string }[];
	canAddManualMember: boolean;
	onAddManualMember: () => void;
	onRemoveManualMember: (index: number) => void;
}) => (
	<section className="flex flex-col gap-4">
		<p className="publy-type-eyebrow">{t('initial-members-optional')}</p>

		{memberImport.parsedFile && memberImport.parsedOutcome ? (
			<MemberImportSummary
				t={t}
				fileName={memberImport.parsedFile.fileName}
				outcome={memberImport.parsedOutcome}
				onRemove={memberImport.clearParsedFile}
			/>
		) : (
			<MemberImportDropzone
				t={t}
				fileInputRef={memberImport.fileInputRef}
				isDisabled={isFormLocked}
				onFiles={(files) => {
					void memberImport.handleFiles(files);
				}}
			/>
		)}

		{memberImport.importError ? (
			<p className="publy-field-error">{memberImport.importError}</p>
		) : null}

		<div className="flex items-center gap-3">
			<span className="h-px flex-1 bg-(--publy-row-border)" />
			<span className="publy-type-helper shrink-0">{t('or-add-manually')}</span>
			<span className="h-px flex-1 bg-(--publy-row-border)" />
		</div>

		<div className="flex flex-col gap-3">
			{manualMemberFields.map((field, index) => (
				<div
					key={field.id}
					className="grid grid-cols-[1fr_96px_32px] items-center gap-2"
				>
					<Field.Email
						name={`manualMembers.${index}.email`}
						label={t('email')}
						placeholder="user@example.com"
						isDisabled={isFormLocked}
					/>
					<Controller
						control={control}
						name={`manualMembers.${index}.accountLevel`}
						render={({ field: levelField }) => (
							<MemberLevelSelect
								name={`manualMembers.${index}.accountLevel`}
								value={getUserLevel(levelField.value)}
								onChange={levelField.onChange}
								onBlur={levelField.onBlur}
								disabled={isFormLocked}
								ariaLabel={t('account-level')}
								t={t}
							/>
						)}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={isFormLocked}
						onClick={() => {
							onRemoveManualMember(index);
						}}
						aria-label={t('remove-member')}
					>
						<IconX aria-hidden="true" className="size-4" />
					</Button>
				</div>
			))}
		</div>

		<Button
			type="button"
			variant="outline"
			size="sm"
			disabled={isFormLocked || !canAddManualMember}
			onClick={onAddManualMember}
			className="w-fit border-dashed border-(--publy-border-strong) bg-transparent"
		>
			<IconPlus aria-hidden="true" className="size-3.5" />
			{t('add-member')}
		</Button>
	</section>
);
