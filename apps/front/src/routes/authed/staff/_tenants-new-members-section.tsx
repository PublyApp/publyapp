import {
	IconFileCheck,
	IconFileSpreadsheet,
	IconPlus,
	IconX,
} from '@tabler/icons-react';
import { Controller, type Control } from 'react-hook-form';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';

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
}: {
	t: TranslateFn;
	fileInputRef: MemberImport['fileInputRef'];
	onFiles: (files: FileList | null) => void;
}) => (
	<div
		className="flex flex-col items-center gap-1.5 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-dashed border-(--publy-border-strong) bg-(--publy-surface-muted) px-4 py-6 text-center"
		data-testid="tenant-member-dropzone"
		onDragOver={(event) => {
			event.preventDefault();
		}}
		onDrop={(event) => {
			event.preventDefault();
			onFiles(event.dataTransfer.files);
		}}
	>
		<IconFileSpreadsheet
			aria-hidden="true"
			className="size-6 text-muted-foreground"
		/>
		<label
			htmlFor="tenant-member-file-input"
			className="cursor-pointer text-[13px] font-medium text-foreground"
		>
			{t('drag-csv-file')}
		</label>
		<p className="publy-type-helper">
			{t('csv-columns-hint')}
			{' · '}
			<Button
				type="button"
				variant="link"
				size="xs"
				className="h-auto p-0 align-baseline"
				onClick={downloadTemplateCsv}
			>
				{t('download-template')}
			</Button>
		</p>
		<input
			ref={fileInputRef}
			id="tenant-member-file-input"
			type="file"
			accept=".csv"
			aria-label={t('drag-csv-file')}
			className="sr-only"
			onChange={(event) => {
				onFiles(event.target.files);
				event.target.value = '';
			}}
		/>
	</div>
);

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
		className="flex items-center justify-between gap-3 rounded-[var(--publy-radius-medium-control)] border border-(--publy-chip-active-border) bg-(--publy-chip-active-bg) px-3.5 py-2.5"
		data-testid="tenant-member-parsed-summary"
	>
		<div className="flex min-w-0 items-center gap-2">
			<IconFileCheck
				aria-hidden="true"
				className="size-4 shrink-0 text-(--publy-chip-active-text)"
			/>
			<div className="min-w-0 text-[13px]">
				<p className="truncate font-medium text-foreground">{fileName}</p>
				<p className="publy-type-helper">
					{t('parsed-file-summary', {
						detected: outcome.detectedCount,
						valid: outcome.valid.length,
					})}
				</p>
				{outcome.invalidCount > 0 ? (
					<p className="publy-type-helper text-(--publy-danger)">
						{t('parsed-file-invalid-rows', { count: outcome.invalidCount })}
					</p>
				) : null}
				{outcome.duplicateCount > 0 ? (
					<p className="publy-type-helper">
						{t('parsed-file-duplicate-rows', {
							count: outcome.duplicateCount,
						})}
					</p>
				) : null}
			</div>
		</div>
		<Button type="button" variant="ghost" size="sm" onClick={onRemove}>
			{t('remove')}
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

		<MemberImportDropzone
			t={t}
			fileInputRef={memberImport.fileInputRef}
			onFiles={(files) => {
				void memberImport.handleFiles(files);
			}}
		/>

		{memberImport.importError ? (
			<p className="publy-field-error">{memberImport.importError}</p>
		) : null}

		{memberImport.parsedFile && memberImport.parsedOutcome ? (
			<MemberImportSummary
				t={t}
				fileName={memberImport.parsedFile.fileName}
				outcome={memberImport.parsedOutcome}
				onRemove={memberImport.clearParsedFile}
			/>
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
