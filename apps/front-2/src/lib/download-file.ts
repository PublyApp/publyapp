/** Triggers a browser download for in-memory file data (e.g. an export
 * response body) without navigating away from the current route. */
export const downloadFile = ({
	data,
	fileName,
	mimeType,
}: {
	data: BlobPart;
	fileName: string;
	mimeType: string;
}): void => {
	const blob = new Blob([data], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');

	anchor.href = url;
	anchor.download = fileName;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
};

/** `YYYY-MM-DD` for export file names — no timezone/locale ambiguity. */
export const formatExportDateStamp = (date: Date): string => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};
