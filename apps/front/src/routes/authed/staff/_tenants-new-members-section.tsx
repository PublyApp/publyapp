import { IconDownload, IconPlus, IconX } from '@tabler/icons-react';
import { useId } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { FieldDropZone } from '~/components/field/field-drop-zone';
import { GroupRow } from '~/components/field/field-group';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

import { type TranslateFn } from './_tenant-form-shared';
import { MemberLevelSelect, ROW_CONTROL } from './_tenants-new-fields';
import {
	downloadTemplateCsv,
	type useTenantMemberImport,
} from './_tenants-new-import';
import { getUserLevel } from './_tenants-new-schema';
import { type TenantCreateFormValues } from './_tenants-new-types';
import { type buildMemberImportOutcome } from './tenants-new-helpers';

type ImportOutcome = ReturnType<typeof buildMemberImportOutcome>;
type MemberImport = ReturnType<typeof useTenantMemberImport>;

const parsedFileMeta = (t: TranslateFn, outcome: ImportOutcome): string => {
	const parts = [
		t('parsed-file-summary', {
			detected: outcome.detectedCount,
			valid: outcome.valid.length,
		}),
	];
	if (outcome.invalidCount > 0) {
		parts.push(t('parsed-file-invalid-rows', { count: outcome.invalidCount }));
	}
	if (outcome.duplicateCount > 0) {
		parts.push(
			t('parsed-file-duplicate-rows', { count: outcome.duplicateCount }),
		);
	}
	return parts.join(' · ');
};

/** The `Membres initiaux` row of the people group: the CSV drop zone (or the
 * chosen file with its counts), the manual rows with their admin/user level,
 * and the add button. */
export const TenantCreateMembersRow = ({
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
}) => {
	const csvInputId = useId();

	return (
		<GroupRow
			label={t('initial-members')}
			badge={
				<span className="text-xs text-muted-foreground">{t('optional')}</span>
			}
		>
			<FieldDropZone
				kind="csv"
				title={t('import-members-title')}
				dropLabel={t('drop-file-here')}
				action={t('choose-csv-file')}
				hint={
					<span>
						{t('or-drag-here')} · {t('csv-drop-hint')}
					</span>
				}
				inputId={csvInputId}
				inputRef={memberImport.fileInputRef}
				accept=".csv"
				file={
					memberImport.parsedFile && memberImport.parsedOutcome
						? {
								name: memberImport.parsedFile.fileName,
								meta: parsedFileMeta(t, memberImport.parsedOutcome),
							}
						: undefined
				}
				isDisabled={isFormLocked}
				clearLabel={t('remove')}
				testId="tenant-member-dropzone"
				template={
					<button
						type="button"
						className="inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium whitespace-nowrap text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
						onClick={(event) => {
							event.preventDefault();
							event.stopPropagation();
							downloadTemplateCsv();
						}}
					>
						<IconDownload aria-hidden="true" className="size-3.5" />
						{t('download-template')}
					</button>
				}
				onFiles={(files) => {
					void memberImport.handleFiles(files);
				}}
				onClear={memberImport.clearParsedFile}
			/>

			{memberImport.importError ? (
				<p className="text-xs text-destructive">{memberImport.importError}</p>
			) : null}

			{manualMemberFields.length > 0 ? (
				<div className="flex flex-col gap-2">
					{manualMemberFields.map((field, index) => (
						<div key={field.id} className="flex items-center gap-2">
							<Controller
								control={control}
								name={`manualMembers.${index}.email`}
								render={({ field: emailField }) => (
									<Input
										type="email"
										name={`manualMembers.${index}.email`}
										value={emailField.value}
										placeholder={t('member-email-placeholder')}
										disabled={isFormLocked}
										onBlur={emailField.onBlur}
										onChange={(event) => {
											emailField.onChange(event.target.value);
										}}
										aria-label={t('email')}
										className={ROW_CONTROL}
									/>
								)}
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
								className="rounded-[var(--publy-radius-control)]"
								disabled={isFormLocked}
								onClick={() => {
									onRemoveManualMember(index);
								}}
								aria-label={t('remove-member')}
							>
								<IconX aria-hidden="true" />
							</Button>
						</div>
					))}
				</div>
			) : null}

			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={isFormLocked || !canAddManualMember}
				onClick={onAddManualMember}
				className="w-fit rounded-[var(--publy-radius-control)] border-transparent shadow-[var(--publy-shadow-ring)]"
			>
				<IconPlus data-icon="inline-start" />
				{t('add-member')}
			</Button>
		</GroupRow>
	);
};
