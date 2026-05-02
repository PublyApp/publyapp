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
