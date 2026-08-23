import { useMemo, useRef, useState } from 'react';
import { downloadFile } from '~/lib/download-file';

import {
	buildMemberImportOutcome,
	buildTenantMemberCsvTemplate,
	parseCsv,
	type ImportedMember,
} from './tenants-new-helpers';

/** Mirrors the field-image-upload guard: an advisory `accept` attribute alone
 * does not stop a drag-and-drop drop, which bypasses the file input entirely.
 * CSV-only: `xlsx` (SheetJS) was dropped for known CVEs (round-1 review
 * shell-F1) — the npm registry copy is frozen at a vulnerable version and the
 * fixed release is only published on SheetJS's own CDN, which fails this
 * repo's exact-pin supply-chain check. */
const IMPORT_FILE_EXTENSION_PATTERN = /\.csv$/i;
const MAX_IMPORT_FILE_BYTES = 2_000_000;

export const downloadTemplateCsv = () => {
	downloadFile({
		data: buildTenantMemberCsvTemplate(),
		fileName: 'tenant-members-template.csv',
		mimeType: 'text/csv;charset=utf-8',
	});
};

type ParsedFile = {
	fileName: string;
	rows: ReturnType<typeof parseCsv>;
};

/** Owns the CSV member-import side of the create-tenant form: the picked file,
 * its parse errors, and the de-duplicated outcome derived against the emails
 * already typed into the form. */
export const useTenantMemberImport = ({
	t,
	owners,
	manualMembers,
}: {
	t: (key: string) => string;
	owners: { email: string }[];
	manualMembers: { email: string }[];
}) => {
	const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
	const [importError, setImportError] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);

	const existingEmails = useMemo(
		() => [
			...owners.map((owner) => owner.email),
			...manualMembers.map((member) => member.email),
		],
		[owners, manualMembers],
	);

	const parsedOutcome = useMemo(() => {
		if (!parsedFile) {
			return null;
		}

		return buildMemberImportOutcome({
			rows: parsedFile.rows,
			existingEmails,
		});
	}, [parsedFile, existingEmails]);

	const parsedValidMembers: ImportedMember[] = parsedOutcome?.valid ?? [];

	const handleFiles = async (fileList: FileList | null) => {
		const file = fileList?.[0];
		if (!file) {
			return;
		}

		setImportError('');

		if (!IMPORT_FILE_EXTENSION_PATTERN.test(file.name)) {
			setImportError(t('import-file-invalid-type'));
			return;
		}

		if (file.size > MAX_IMPORT_FILE_BYTES) {
			setImportError(t('import-file-too-large'));
			return;
		}

		try {
			const rows = parseCsv(await file.text());
			setParsedFile({ fileName: file.name, rows });
		} catch {
			setImportError(t('import-file-parse-failed'));
		}
	};

	return {
		parsedFile,
		clearParsedFile: () => {
			setParsedFile(null);
		},
		importError,
		fileInputRef,
		parsedOutcome,
		parsedValidMembers,
		handleFiles,
	};
};
