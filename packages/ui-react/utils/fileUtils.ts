export interface ExtendFile extends File {
	preview?: string;
	path?: string;
	lastModifiedDate?: string;
}

// ----------------------------------------------------------------------

export const fileTypeByUrl = (fileUrl = '') => {
	return (fileUrl && fileUrl.split('.').pop()) || '';
};

// ----------------------------------------------------------------------

export const fileNameByUrl = (fileUrl: string) => {
	return fileUrl.split('/').pop();
};

// ----------------------------------------------------------------------

export const fileData = (file: ExtendFile | string) => {
	// Url
	if (typeof file === 'string') {
		return {
			key: file,
			preview: file,
			name: fileNameByUrl(file),
			type: fileTypeByUrl(file),
		};
	}

	// File
	return {
		key: file.preview,
		name: file.name,
		size: file.size,
		path: file.path,
		type: file.type,
		preview: file.preview,
		lastModified: file.lastModified,
		lastModifiedDate: file.lastModifiedDate,
	};
};
