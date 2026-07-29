import { buildCsv } from './csv.ts';

type DownloadTextFileArgs = {
	fileName: string;
	mimeType: string;
	content: BlobPart;
};

type DownloadCsvFileArgs = {
	fileName: string;
	rows: Array<Array<string | number | null | undefined>>;
};

type DownloadJsonFileArgs = {
	fileName: string;
	data: unknown;
};

export const downloadTextFile = ({
	fileName,
	mimeType,
	content,
}: DownloadTextFileArgs) => {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');

	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	URL.revokeObjectURL(url);
};

export const downloadCsvFile = ({ fileName, rows }: DownloadCsvFileArgs) => {
	// Centralize CSV download plumbing so table exports only own row projection.
	downloadTextFile({
		fileName,
		mimeType: 'text/csv',
		content: buildCsv(rows),
	});
};

export const downloadJsonFile = ({ fileName, data }: DownloadJsonFileArgs) => {
	downloadTextFile({
		fileName,
		mimeType: 'application/json',
		content: JSON.stringify(data, null, 2),
	});
};

/**
 * Append a UTC timestamp suffix to an export filename to avoid silent
 * overwrites when re-running an export. Format: `<base>-YYYY-MM-DD-HHmm.<ext>`.
 *
 * Example: `withTimestamp('staff-invitations', 'csv')`
 *   -> 'staff-invitations-2026-05-09-1430.csv'
 *
 * Uses UTC so the filename is consistent across timezones; users that need
 * a local-time variant can format their own at the call site.
 */
export const withTimestamp = (baseName: string, extension: string) => {
	const now = new Date();
	const yyyy = now.getUTCFullYear();
	const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(now.getUTCDate()).padStart(2, '0');
	const hh = String(now.getUTCHours()).padStart(2, '0');
	const min = String(now.getUTCMinutes()).padStart(2, '0');
	return `${baseName}-${yyyy}-${mm}-${dd}-${hh}${min}.${extension}`;
};
