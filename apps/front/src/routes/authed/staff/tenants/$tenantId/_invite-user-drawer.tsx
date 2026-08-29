import {
	IconFileSpreadsheet,
	IconPlus,
	IconTrash,
	IconUpload,
	IconX,
} from '@tabler/icons-react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ChangeEvent, DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Field } from '~/components/field';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerForm,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { downloadFile } from '~/lib/download-file';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	toResolveTenantProfileNameResolutions,
	useResolveTenantProfileNamesMutation,
} from '~/lib/query/staff-tenant-profiles';
import {
	type StaffTenantInvitationBulkCreateFailedItem,
	type StaffTenantInvitationBulkCreateSummary,
	toStaffTenantInvitationBulkCreateSummary,
	useBulkInviteTenantUsersMutation,
} from '~/lib/query/staff-tenant-users';
import { invalidateAllStaffTenantScopes } from '~/lib/query/staff-tenants';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { InviteProfileSelect } from './_invite-profile-select';
import {
	applyProfileResolutions,
	buildImportedInvites,
	buildInviteTemplateCsv,
	buildSubmitInvitations,
	EMAIL_REGEX,
	canSendInvitations,
	clearFileRows,
	makeManualRow,
	parseInviteCsv,
	parseInviteWorkbook,
	parseInviteeEmails,
	renderInvalidCellMessage,
	syncInvalidEmail,
	type InvalidCell,
	type InviteFormValues,
	type InviteRow,
	useInviteForm,
} from './_invite-user-form-state';

const MAX_IMPORT_FILE_BYTES = 2_000_000;
const MAX_PROFILE_NAMES = 500;
const CSV_EXTENSION_PATTERN = /\.csv$/i;
const EXCEL_EXTENSION_PATTERN = /\.xlsx?$/i;

// InviteFormValues, DEFAULT_VALUES, and useInviteForm are exported from
// _invite-user-form-state (react-doctor forbids non-component exports in .tsx).

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Signature of the profile names currently awaiting server resolution.
 * Deduped case-insensitively because that is how the server matches. */
const profileNamesNeedingResolution = (rows: InviteRow[]): string[] => {
	const seen = new Set<string>();
	const names: string[] = [];

	for (const row of rows) {
		for (const name of row.profileNames) {
			const identity = name.toLowerCase();
			if (!identity || seen.has(identity)) {
				continue;
			}

			seen.add(identity);
			names.push(name);
		}
	}

	return names;
};

const PasteInviteesSection = ({
	tenantId,
	isFormLocked,
	onAddPastedEmails,
	t,
}: {
	tenantId: string;
	isFormLocked: boolean;
	onAddPastedEmails: () => void;
	t: Translate;
}) => (
	<section className="space-y-3 rounded-[var(--publy-radius-card)] p-3 shadow-[var(--publy-shadow-ring)]">
		<div className="space-y-1">
			<h3 className="text-sm font-semibold text-foreground">
				{t('paste-email-addresses')}
			</h3>
			<p className="text-xs text-muted-foreground">
				{t('paste-email-addresses-description')}
			</p>
		</div>
		<Field.Textarea
			name="pasteEmails"
			label={t('paste-emails')}
			placeholder={t('paste-emails-placeholder')}
			rows={3}
			isDisabled={isFormLocked}
		/>
		<div className="grid gap-3 sm:grid-cols-2">
			<Field.Select
				name="sharedAccountLevel"
				label={t('shared-account-level')}
				options={[
					{ value: 'Admin', label: t('admin') },
					{ value: 'User', label: t('user') },
				]}
				isDisabled={isFormLocked}
			/>
			<InviteProfileSelect
				tenantId={tenantId}
				name="sharedProfileIds"
				label={t('shared-profiles')}
				isDisabled={isFormLocked}
			/>
		</div>
		<Button
			type="button"
			variant="outline"
			disabled={isFormLocked}
			onClick={onAddPastedEmails}
		>
			<IconPlus aria-hidden="true" className="size-4" />
			{t('add-pasted-emails')}
		</Button>
	</section>
);

type FileDropzoneProps = {
	isFormLocked: boolean;
	fileBar: { fileName: string; rowCount: number } | null;
	importError: string;
	duplicateNote: string;
	onFiles: (fileList: FileList | null) => void;
	onClearFile: () => void;
	t: Translate;
};

const ImportFileSection = ({
	isFormLocked,
	fileBar,
	importError,
	duplicateNote,
	onFiles,
	onClearFile,
	t,
}: FileDropzoneProps) => {
	const [isDragOver, setIsDragOver] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const handleDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		setIsDragOver(false);
		if (!isFormLocked) {
			onFiles(event.dataTransfer.files);
		}
	};

	if (fileBar) {
		return (
			<section className="space-y-1 rounded-[var(--publy-radius-card)] p-3 shadow-[var(--publy-shadow-ring)]">
				<div
					className="flex items-center justify-between gap-3"
					data-testid="invite-file-bar"
				>
					<p className="flex min-w-0 items-center gap-2 text-sm text-foreground">
						<IconFileSpreadsheet
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
						<span className="truncate font-medium">{fileBar.fileName}</span>
						<span className="shrink-0 text-muted-foreground">
							{t('invite-file-bar-rows', { count: fileBar.rowCount })}
						</span>
					</p>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={isFormLocked}
						aria-label={t('invite-clear-file')}
						onClick={onClearFile}
					>
						<IconX aria-hidden="true" className="size-4" />
					</Button>
				</div>
				{duplicateNote ? (
					<p className="text-xs text-muted-foreground">{duplicateNote}</p>
				) : null}
				{importError ? (
					<p className="text-sm text-destructive" role="alert">
						{importError}
					</p>
				) : null}
			</section>
		);
	}

	return (
		<section className="space-y-2">
			<div
				data-testid="invite-dropzone"
				role="button"
				tabIndex={0}
				aria-disabled={isFormLocked}
				className={`flex flex-col items-center justify-center gap-1 rounded-[var(--publy-radius-card)] border border-dashed p-6 text-center transition-colors ${
					isDragOver
						? 'border-ring bg-muted'
						: 'border-(--publy-border-strong) hover:bg-muted'
				}`}
				onDragOver={(event) => {
					event.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={handleDrop}
				onClick={() => {
					if (!isFormLocked) {
						inputRef.current?.click();
					}
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						if (!isFormLocked) {
							inputRef.current?.click();
						}
					}
				}}
			>
				<IconUpload
					aria-hidden="true"
					className="size-5 text-muted-foreground"
				/>
				<p className="text-sm font-medium text-foreground">
					{t('invite-drop-file')}
				</p>
				<p className="text-xs text-muted-foreground">
					{t('invite-file-columns-hint')}
				</p>
				<input
					ref={inputRef}
					type="file"
					className="sr-only"
					accept=".csv,.xlsx,.xls"
					disabled={isFormLocked}
					onChange={(event: ChangeEvent<HTMLInputElement>) => {
						onFiles(event.target.files);
						event.target.value = '';
					}}
					onClick={(event) => event.stopPropagation()}
					aria-label={t('invite-drop-file')}
				/>
			</div>
			<div className="flex items-center justify-between gap-3">
				{importError ? (
					<p className="text-sm text-destructive" role="alert">
						{importError}
					</p>
				) : (
					<span />
				)}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={isFormLocked}
					onClick={() =>
						downloadFile({
							data: buildInviteTemplateCsv(),
							fileName: 'tenant-invite-template.csv',
							mimeType: 'text/csv;charset=utf-8',
						})
					}
				>
					{t('invite-download-template')}
				</Button>
			</div>
		</section>
	);
};

const OrAddManuallyDivider = ({ t }: { t: Translate }) => (
	<div className="flex items-center gap-3" aria-hidden="true">
		<span className="h-px flex-1 bg-border" />
		<span className="text-[11px] uppercase tracking-wide text-muted-foreground">
			{t('invite-or-add-manually')}
		</span>
		<span className="h-px flex-1 bg-border" />
	</div>
);

const unresolvedFlagCount = (
	unresolvedByRowKey: Record<string, UnresolvedEntry[]>,
): number => {
	let total = 0;
	for (const entries of Object.values(unresolvedByRowKey)) {
		total += entries.length;
	}

	return total;
};

type UnresolvedEntry = { name: string; reason: string };

type UseInviteProfileResolutionArgs = {
	tenantId: string;
	rows: InviteRow[];
	isOpen: boolean;
	methods: ReturnType<typeof useForm<InviteFormValues>>;
	resolveNames: ReturnType<typeof useResolveTenantProfileNamesMutation>;
	onSessionExpired: () => void;
	t: Translate;
};

const useInviteProfileResolution = ({
	tenantId,
	rows,
	isOpen,
	methods,
	resolveNames,
	onSessionExpired,
	t,
}: UseInviteProfileResolutionArgs) => {
	/** Server-side profile-name resolution (#979): resolves the unique names on
	 * file/manual rows once per signature change and stamps ids back onto the rows.
	 * Pulled into its own hook so the host component stays under the
	 * giant-component threshold. Owns the unresolved-by-row-key map, the
	 * over-limit error, and the resolving flag.
	 *
	 * State updates fire from a methods.watch callback (event handler), not from an
	 * effect body — this is what react-doctor's no-pass-data-to-parent and
	 * no-adjust-state-on-prop-change permit. The effect only subscribes and runs an
	 * initial pass. */
	const [unresolvedByRowKey, setUnresolvedByRowKey] = useState<
		Record<string, UnresolvedEntry[]>
	>({});
	const [profileResolutionLimitError, setProfileResolutionLimitError] =
		useState('');

	const namesSignature = useMemo(
		() => profileNamesNeedingResolution(rows ?? []).join('\u0000'),
		[rows],
	);
	const lastResolvedSignatureRef = useRef<string>('');
	const { mutateAsync: resolveNamesAsync } = resolveNames;

	useEffect(() => {
		const onRowsChange = () => {
			const currentRows = methods.getValues('rows');
			const synced = syncInvalidEmail(currentRows);
			if (
				JSON.stringify(synced.map((r) => r.invalidEmail)) !==
				JSON.stringify(currentRows.map((r) => r.invalidEmail))
			) {
				methods.setValue('rows', synced, { shouldDirty: false });
			}

			if (!isOpen || namesSignature.length === 0) {
				setProfileResolutionLimitError('');
				return;
			}

			const names = namesSignature.split('\u0000');
			if (names.length > MAX_PROFILE_NAMES) {
				setProfileResolutionLimitError(
					t('invite-import-too-many-profile-names', {
						count: names.length,
						limit: MAX_PROFILE_NAMES,
					}),
				);
				return;
			}

			setProfileResolutionLimitError('');

			if (lastResolvedSignatureRef.current === namesSignature) {
				return;
			}

			lastResolvedSignatureRef.current = namesSignature;

			resolveNamesAsync({
				tenantId,
				names: namesSignature.split('\u0000'),
			})
				.then((result) => {
					if (lastResolvedSignatureRef.current !== namesSignature) {
						return;
					}

					const resolutions = toResolveTenantProfileNameResolutions(result);
					const currentRows = methods.getValues('rows');
					const outcome = applyProfileResolutions(currentRows, resolutions);
					methods.setValue('rows', outcome.rows, { shouldDirty: true });
					setUnresolvedByRowKey(outcome.unresolvedByRowKey);
				})
				.catch((error) => {
					if (lastResolvedSignatureRef.current !== namesSignature) {
						return;
					}

					if (shouldLogoutForFailure(error)) {
						onSessionExpired();
						return;
					}

					lastResolvedSignatureRef.current = '';
					void displayLocalMutationFailure(error, t('unable-to-load-profiles'));
				});
		};

		onRowsChange();
		const subscription = methods.watch(() => onRowsChange());
		return () => {
			subscription.unsubscribe();
		};
	}, [
		isOpen,
		namesSignature,
		tenantId,
		methods,
		resolveNamesAsync,
		onSessionExpired,
		t,
	]);

	return {
		unresolvedByRowKey,
		profileResolutionLimitError,
		isResolvingProfiles: resolveNames.isPending,
	};
};

type RowInvalidLevelNoteProps = {
	invalidLevel: string | null;
	email: string;
	t: Translate;
};

const RowInvalidLevelNote = ({
	invalidLevel,
	email,
	t,
}: RowInvalidLevelNoteProps) => {
	if (!invalidLevel) {
		return null;
	}

	return (
		<p className="text-xs text-destructive" role="alert">
			{t('invite-invalid-level', { email, level: invalidLevel })}
		</p>
	);
};

const RowInvalidEmailNote = ({
	invalidEmail,
	t,
}: {
	invalidEmail: string | null;
	t: Translate;
}) => {
	if (!invalidEmail) {
		return null;
	}

	return (
		<p className="text-xs text-destructive" role="alert">
			{t('invite-invalid-email', { email: invalidEmail })}
		</p>
	);
};

const RowInvalidCellNote = ({
	invalidCell,
	t,
}: {
	invalidCell: InvalidCell | null;
	t: Translate;
}) => {
	if (!invalidCell) {
		return null;
	}

	return (
		<p className="text-xs text-destructive" role="alert">
			{renderInvalidCellMessage(invalidCell, t)}
		</p>
	);
};

const RowUnresolvedNotes = ({
	unresolved,
	t,
}: {
	unresolved: UnresolvedEntry[] | undefined;
	t: Translate;
}) => {
	if (!unresolved || unresolved.length === 0) {
		return null;
	}

	const notFound: string[] = [];
	const ambiguous: string[] = [];
	for (const entry of unresolved) {
		if (entry.reason === 'not-found') {
			notFound.push(entry.name);
		} else if (entry.reason === 'ambiguous') {
			ambiguous.push(entry.name);
		}
	}

	return (
		<div role="alert" className="space-y-0.5">
			{notFound.length > 0 ? (
				<p className="text-xs text-destructive">
					{t('invite-unresolved-profile-not-found', {
						names: notFound.join(', '),
					})}
				</p>
			) : null}
			{ambiguous.length > 0 ? (
				<p className="text-xs text-destructive">
					{t('invite-unresolved-profile-ambiguous', {
						names: ambiguous.join(', '),
					})}
				</p>
			) : null}
		</div>
	);
};

type InviteRowsListProps = {
	tenantId: string;
	fields: Array<{ id: string }>;
	rows: InviteRow[];
	unresolvedByRowKey: Record<string, UnresolvedEntry[]>;
	isFormLocked: boolean;
	onRemoveRow: (index: number) => void;
	onAddRow: () => void;
	t: Translate;
};

const InviteRowsList = ({
	tenantId,
	fields,
	rows,
	unresolvedByRowKey,
	isFormLocked,
	onRemoveRow,
	onAddRow,
	t,
}: InviteRowsListProps) => {
	const renderInviteRow = (field: { id: string }, index: number) => {
		const renderRowProfileControl = (row: InviteRow, isAdmin: boolean) => {
			if (isAdmin) {
				return (
					<p className="text-xs text-muted-foreground">
						{t('invite-admin-full-access')}
					</p>
				);
			}

			if (row.source === 'manual') {
				return (
					<InviteProfileSelect
						tenantId={tenantId}
						name={`rows.${index}.profileIds`}
						label={t('profiles')}
						isDisabled={isFormLocked}
					/>
				);
			}

			return null;
		};

		const row = rows[index];
		if (!row) {
			return null;
		}

		const isAdmin = row.accountLevel === 'Admin';

		return (
			<section
				key={field.id}
				className="space-y-3 rounded-[var(--publy-radius-card)] p-3 shadow-[var(--publy-shadow-ring)]"
			>
				<div className="flex items-center justify-between gap-3">
					<h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
						<span className="truncate">
							{row.email || t('invite-blank-row')}
						</span>
						{row.source === 'file' ? (
							<span className="publy-detail-chip publy-detail-chip--outline shrink-0">
								{t('invite-source-file')}
							</span>
						) : null}
					</h3>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						disabled={isFormLocked}
						aria-label={`${t('invite-remove-row')} ${index + 1}`}
						onClick={() => onRemoveRow(index)}
					>
						<IconTrash aria-hidden="true" className="size-4" />
					</Button>
				</div>
				<Field.Email
					name={`rows.${index}.email`}
					label={t('email')}
					placeholder={t('email-placeholder')}
					isDisabled={isFormLocked}
					fullWidth
				/>
				<Field.Select
					name={`rows.${index}.accountLevel`}
					label={t('account-level')}
					options={[
						{ value: 'Admin', label: t('admin') },
						{ value: 'User', label: t('user') },
					]}
					isDisabled={isFormLocked}
				/>
				{renderRowProfileControl(row, isAdmin)}
				{!isAdmin ? (
					<RowUnresolvedNotes unresolved={unresolvedByRowKey[row.key]} t={t} />
				) : null}
				<RowInvalidLevelNote
					invalidLevel={row.invalidLevel}
					email={row.email || t('invite-blank-row')}
					t={t}
				/>
				<RowInvalidEmailNote invalidEmail={row.invalidEmail} t={t} />
				<RowInvalidCellNote invalidCell={row.invalidCell} t={t} />
			</section>
		);
	};

	return (
		<>
			<div className="space-y-3">{fields.map(renderInviteRow)}</div>
			<Button
				type="button"
				variant="outline"
				disabled={isFormLocked}
				onClick={onAddRow}
			>
				<IconPlus aria-hidden="true" className="size-4" />
				{t('invite-add-row')}
			</Button>
		</>
	);
};

const InviteBatchSummary = ({
	batchSummary,
	i18n,
	t,
}: {
	batchSummary: StaffTenantInvitationBulkCreateSummary;
	i18n: { t: (key: string, options?: Record<string, unknown>) => string };
	t: Translate;
}) => {
	const getFailedInviteeMessage = (
		failedItem: StaffTenantInvitationBulkCreateFailedItem,
	): string => {
		const fallback = t('invite-tenant-user-failed');
		const translationKey = failedItem.translationKey;
		if (!translationKey) {
			return fallback;
		}

		return i18n.t(translationKey, {
			ns: 'response-message',
			defaultValue: fallback,
		});
	};

	return (
		<div
			className="space-y-2 rounded-[var(--publy-radius-control)] bg-muted p-3 text-sm"
			role="alert"
		>
			<p className="font-medium text-foreground">
				{t('tenant-invitations-batch-summary', {
					succeeded: batchSummary.succeededCount,
					failed: batchSummary.failedCount,
				})}
			</p>
			<ul className="space-y-1 text-destructive">
				{batchSummary.failedItems.map((failedItem) => (
					<li
						key={`${failedItem.index ?? 'unknown'}-${failedItem.email ?? ''}-${failedItem.translationKey ?? ''}`}
					>
						<span className="font-medium">
							{failedItem.email ?? t('unknown-invitee')}
						</span>
						{' — '}
						{getFailedInviteeMessage(failedItem)}
					</li>
				))}
			</ul>
		</div>
	);
};

type InviteTenantUserDrawerProps = {
	tenantId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onInvited: () => void;
	onSessionExpired: () => void;
	onDirtyChange?: (isDirty: boolean) => void;
};

type InviteFileImportState = {
	fileBar: { fileName: string; rowCount: number } | null;
	importError: string;
	duplicateNote: string;
	handleFiles: (fileList: FileList | null) => Promise<void>;
	clearFile: () => void;
};

/** File-drop / file-input state and the two transitions that own it.
 * Pulled out of InviteTenantUserDrawerInner so the host component stays under
 * the giant-component threshold. Owns: the file-bar pill (file name + parsed
 * row count), the inline import error, and the duplicate-skipped note. */
const useInviteFileImport = ({
	methods,
	t,
}: {
	methods: ReturnType<typeof useForm<InviteFormValues>>;
	t: Translate;
}): InviteFileImportState => {
	const [fileBar, setFileBar] = useState<{
		fileName: string;
		rowCount: number;
	} | null>(null);
	const [importError, setImportError] = useState('');
	const [duplicateNote, setDuplicateNote] = useState('');

	const handleFiles = async (fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) {
			return;
		}

		setImportError('');
		setDuplicateNote('');

		const isCsv = CSV_EXTENSION_PATTERN.test(file.name);
		if (!isCsv && !EXCEL_EXTENSION_PATTERN.test(file.name)) {
			setImportError(t('invite-import-invalid-type'));
			return;
		}

		if (file.size > MAX_IMPORT_FILE_BYTES) {
			setImportError(t('invite-import-too-large'));
			return;
		}

		try {
			let result;
			if (isCsv) {
				result = parseInviteCsv(await file.text());
			} else {
				result = parseInviteWorkbook(new Uint8Array(await file.arrayBuffer()));
			}

			if (result.outcome === 'error') {
				const messageByKind = {
					empty: t('invite-import-empty'),
					'no-email-column': t('invite-import-no-email-column'),
					'unreadable-excel': t('invite-import-unreadable-excel'),
					'no-sheet': t('invite-import-no-sheet'),
				} as const;
				setImportError(messageByKind[result.kind]);
				return;
			}

			const parsedRows = result.rows;
			const existingEmails = methods.getValues('rows').map((row) => row.email);
			const outcome = buildImportedInvites({
				parsedRows,
				existingEmails,
				source: 'file',
			});
			const currentRows = methods.getValues('rows');
			// The untouched blank starter row is a placeholder, not content;
			// keeping it would block Send forever (its email is empty).
			const hasOnlyBlankInitialRow =
				currentRows.length === 1 &&
				currentRows[0]?.email.trim().length === 0 &&
				currentRows[0]?.source === 'manual';
			methods.setValue(
				'rows',
				hasOnlyBlankInitialRow
					? outcome.rows
					: [...outcome.rows, ...currentRows],
				{ shouldDirty: true },
			);
			setFileBar({ fileName: file.name, rowCount: outcome.rows.length });
			if (outcome.duplicateCount > 0) {
				setDuplicateNote(
					t('invite-file-duplicates-skipped', {
						count: outcome.duplicateCount,
					}),
				);
			}
		} catch {
			setImportError(t('invite-import-parse-failed'));
		}
	};

	const clearFile = useCallback(() => {
		setFileBar(null);
		setDuplicateNote('');
		const currentRows = methods.getValues('rows');
		const keptRows = clearFileRows(currentRows);
		methods.setValue(
			'rows',
			keptRows.length > 0 ? keptRows : [makeManualRow()],
			{ shouldDirty: true },
		);
	}, [methods]);

	return { fileBar, importError, duplicateNote, handleFiles, clearFile };
};

const useInviteSubmit = ({
	tenantId,
	methods,
	queryClient,
	bulkInvite,
	onSessionExpired,
	onInvited,
	setRootValidationError,
	setBatchSummary,
}: {
	tenantId: string;
	methods: ReturnType<typeof useForm<InviteFormValues>>;
	queryClient: QueryClient;
	bulkInvite: ReturnType<typeof useBulkInviteTenantUsersMutation>;
	onSessionExpired: () => void;
	onInvited: () => void;
	setRootValidationError: (value: string) => void;
	setBatchSummary: (
		value: StaffTenantInvitationBulkCreateSummary | null,
	) => void;
}) => {
	const { t } = useTranslation('common');

	return methods.handleSubmit(async (values) => {
		setRootValidationError('');
		setBatchSummary(null);

		let result;
		try {
			result = await bulkInvite.mutateAsync({
				tenantId,
				invitations: buildSubmitInvitations(values.rows),
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			const failure = toApiFailure(error);
			if (failure.kind === 'validation') {
				let mappedEmailError = false;
				let hasUnmappedError = false;

				for (const [field, messages] of Object.entries(failure.fieldErrors)) {
					const match =
						/^rows\[(\d+)\]\.email$|^invitations\[(\d+)\]\.email$/i.exec(field);
					const index = match ? Number(match[1] ?? match[2]) : Number.NaN;
					if (Number.isInteger(index) && values.rows[index]) {
						methods.setError(`rows.${index}.email`, {
							type: 'server',
							message: getFailureMessage(failure, {
								fallback: t('invite-tenant-user-failed'),
							}),
						});
						mappedEmailError = true;
					} else {
						hasUnmappedError = messages.length > 0 || hasUnmappedError;
					}
				}

				if (!mappedEmailError || hasUnmappedError) {
					setRootValidationError(
						getFailureMessage(failure, {
							fallback: t('invite-tenant-user-failed'),
						}),
					);
				}
				return;
			}

			await displayLocalMutationFailure(error, t('invite-tenant-user-failed'));
			return;
		}

		if (!result) {
			setRootValidationError(t('invite-tenant-user-failed'));
			return;
		}

		const summary = toStaffTenantInvitationBulkCreateSummary(result);
		if (summary.succeededCount > 0) {
			await invalidateAllStaffTenantScopes(queryClient);
		}

		if (summary.failedCount > 0) {
			setBatchSummary(summary);
			// Keep only the failed rows so the staff member can fix and retry.
			const seenIndexes = new Set<number>();
			const failedRows: InviteRow[] = [];
			for (const failedItem of summary.failedItems) {
				const index = failedItem.index;
				if (index === null || seenIndexes.has(index)) {
					continue;
				}

				const row = values.rows[index];
				if (row) {
					failedRows.push(row);
					seenIndexes.add(index);
				}
			}

			if (failedRows.length > 0) {
				methods.reset(
					{
						...values,
						rows: failedRows,
					},
					{ keepDirty: true, keepDefaultValues: true },
				);
			}
			return;
		}

		toastLocalMutationResult.success(
			t('tenant-invitations-batch-success', {
				count: summary.succeededCount,
			}),
		);
		onInvited();
	});
};

/** Event-driven dirty-flag uplink: react-hook-form's change stream fires
 * synchronously on the form mutation that owns each change. Dirtiness comes
 * from its own synchronous dirty computation against the pristine defaults
 * this session mounted with. The parent setter is called from the change
 * callback, not an effect, which no-pass-data-to-parent permits. */
const useInviteDirtyUplink = ({
	methods,
	onDirtyChange,
}: {
	methods: ReturnType<typeof useForm<InviteFormValues>>;
	onDirtyChange?: (isDirty: boolean) => void;
}) => {
	const lastReportedDirtyRef = useRef<boolean | null>(null);
	useEffect(() => {
		const report = (nextDirty: boolean) => {
			if (lastReportedDirtyRef.current !== nextDirty) {
				lastReportedDirtyRef.current = nextDirty;
				onDirtyChange?.(nextDirty);
			}
		};
		const computeNextDirty = () => methods.control._getDirty();
		lastReportedDirtyRef.current = null;
		report(computeNextDirty());
		const subscription = methods.watch(() => {
			report(computeNextDirty());
		});
		return () => {
			subscription.unsubscribe();
		};
	}, [methods, onDirtyChange]);
};

const InviteTenantUserDrawerInner = ({
	tenantId,
	isOpen,
	onOpenChange,
	onInvited,
	onSessionExpired,
	onDirtyChange,
}: InviteTenantUserDrawerProps) => {
	const { t, i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const bulkInvite = useBulkInviteTenantUsersMutation();
	const resolveNames = useResolveTenantProfileNamesMutation();
	const [rootValidationError, setRootValidationError] = useState('');
	const [batchSummary, setBatchSummary] =
		useState<StaffTenantInvitationBulkCreateSummary | null>(null);

	const methods = useInviteForm();
	const {
		control,
		formState: { isSubmitting },
	} = methods;

	useInviteDirtyUplink({ methods, onDirtyChange });

	const { fileBar, importError, duplicateNote, handleFiles, clearFile } =
		useInviteFileImport({ methods, t });
	const { fields, append, remove, replace } = useFieldArray({
		control,
		name: 'rows',
	});
	const rows = methods.watch('rows');
	const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

	const {
		unresolvedByRowKey,
		profileResolutionLimitError,
		isResolvingProfiles,
	} = useInviteProfileResolution({
		tenantId,
		rows: rows ?? [],
		isOpen,
		methods,
		resolveNames,
		onSessionExpired,
		t,
	});

	const isFormLockedFinal =
		bulkInvite.isPending || isSubmitting || resolveNames.isPending;

	const addPastedEmails = () => {
		setRootValidationError('');
		setBatchSummary(null);
		const emails = parseInviteeEmails(methods.getValues('pasteEmails') ?? '');
		if (emails.length === 0) {
			setRootValidationError(t('no-invitee-emails-to-add'));
			return;
		}

		const sharedAccountLevel = methods.getValues('sharedAccountLevel');
		const sharedProfileIds = methods.getValues('sharedProfileIds');
		const currentRows = methods.getValues('rows');
		const outcome = buildImportedInvites({
			parsedRows: emails.map((email) => ({
				email,
				accountLevel: sharedAccountLevel,
				profileNames: [] as string[],
				invalidLevel: null,
				invalidEmail: EMAIL_REGEX.test(email) ? null : email,
				invalidCell: null,
			})),
			existingEmails: currentRows.map((row) => row.email),
			source: 'manual',
		});
		const stampedRows = outcome.rows.map((row) => ({
			...row,
			profileIds: [...sharedProfileIds],
		}));
		const hasOnlyBlankInitialRow =
			currentRows.length === 1 &&
			currentRows[0]?.email.trim().length === 0 &&
			currentRows[0]?.source === 'manual';

		if (hasOnlyBlankInitialRow) {
			replace([...stampedRows]);
		} else {
			for (const row of stampedRows) {
				append(row);
			}
		}
		methods.setValue('pasteEmails', '', { shouldDirty: true });
	};

	const isFormDirty = () => methods.control._getDirty();
	const requestClose = () => {
		// formState.isDirty is a render-subscribed proxy and nobody renders it
		// here; read the freshly computed value instead or dirty forms close
		// without their discard confirmation.
		if (isFormDirty()) {
			setIsDiscardConfirmOpen(true);
			return;
		}

		onOpenChange(false);
	};

	const canSend = canSendInvitations({
		rows: rows ?? [],
		isResolvingProfiles,
		unresolvedCount: unresolvedFlagCount(unresolvedByRowKey),
		invalidLevelCount: (rows ?? []).filter((row) => row.invalidLevel !== null)
			.length,
		invalidCellCount: (rows ?? []).filter((row) => row.invalidCell !== null)
			.length,
	});
	const isSendDisabled =
		isFormLockedFinal || !canSend || profileResolutionLimitError.length > 0;
	const peopleCount = rows?.length ?? 0;

	const onSubmit = useInviteSubmit({
		tenantId,
		methods,
		queryClient,
		bulkInvite,
		onSessionExpired,
		onInvited,
		setRootValidationError,
		setBatchSummary,
	});

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (isFormLockedFinal || isResolvingProfiles) {
					return;
				}

				if (!open) {
					requestClose();
					return;
				}

				onOpenChange(open);
			}}
		>
			<DrawerContent data-testid="invite-tenant-user-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('invite-tenant-user')}</DrawerTitle>
					<DrawerDescription>
						{t('invite-tenant-users-description')}
					</DrawerDescription>
				</DrawerHeader>
				<DrawerForm methods={methods} onSubmit={onSubmit}>
					<DrawerBody className="space-y-5">
						<ImportFileSection
							isFormLocked={isFormLockedFinal || isResolvingProfiles}
							fileBar={fileBar}
							importError={importError}
							duplicateNote={duplicateNote}
							onFiles={(files) => {
								void handleFiles(files);
							}}
							onClearFile={clearFile}
							t={t}
						/>
						<OrAddManuallyDivider t={t} />
						<PasteInviteesSection
							tenantId={tenantId}
							isFormLocked={isFormLockedFinal || isResolvingProfiles}
							onAddPastedEmails={addPastedEmails}
							t={t}
						/>
						<InviteRowsList
							tenantId={tenantId}
							fields={fields}
							rows={rows ?? []}
							unresolvedByRowKey={unresolvedByRowKey}
							isFormLocked={isFormLockedFinal || isResolvingProfiles}
							onRemoveRow={remove}
							onAddRow={() => append(makeManualRow())}
							t={t}
						/>
						{batchSummary ? (
							<InviteBatchSummary
								batchSummary={batchSummary}
								i18n={i18n}
								t={t}
							/>
						) : null}

						{rootValidationError ? (
							<p className="text-sm text-destructive" role="alert">
								{rootValidationError}
							</p>
						) : null}
						{profileResolutionLimitError ? (
							<p className="text-sm text-destructive" role="alert">
								{profileResolutionLimitError}
							</p>
						) : null}
					</DrawerBody>
					<DrawerFooter>
						<p className="mr-auto self-center text-sm text-muted-foreground">
							{t('invite-footer-count', { count: peopleCount })}
						</p>
						<Button
							type="button"
							variant="ghost"
							disabled={isFormLockedFinal || isResolvingProfiles}
							onClick={requestClose}
						>
							{t('cancel')}
						</Button>
						<Button type="submit" disabled={isSendDisabled}>
							{t('invite-send-invitations', { count: peopleCount })}
						</Button>
					</DrawerFooter>
				</DrawerForm>
			</DrawerContent>
			<ConfirmDialog
				isOpen={isDiscardConfirmOpen}
				title={t('unsaved-changes-dialog-title')}
				description={t('unsaved-changes-dialog-description')}
				confirmLabel={t('leave-page')}
				tone="danger"
				onOpenChange={setIsDiscardConfirmOpen}
				onConfirm={() => {
					setIsDiscardConfirmOpen(false);
					onOpenChange(false);
				}}
			/>
		</Drawer>
	);
};

/*
 * Session-keyed mount: each closed -> opened transition bumps a key and
 * remounts the drawer, which seeds itself from its defaultValues at mount.
 * The reset effect this replaced also cleared transient state through
 * prop-change effects; the fresh mount covers all of it exactly once per
 * session. The 200ms exit animation keeps the closing instance mounted
 * under its old key.
 */
export const InviteTenantUserDrawer = (
	drawerProps: InviteTenantUserDrawerProps,
) => {
	const [sessionKey, setSessionKey] = useState(0);
	const [wasOpen, setWasOpen] = useState(drawerProps.isOpen);
	if (wasOpen !== drawerProps.isOpen) {
		setWasOpen(drawerProps.isOpen);
		if (drawerProps.isOpen) {
			setSessionKey((key) => key + 1);
		}
	}

	return <InviteTenantUserDrawerInner {...drawerProps} key={sessionKey} />;
};
