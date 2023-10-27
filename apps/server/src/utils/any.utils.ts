import { DEFAULT_PAGE_SIZE } from '@shared/utils/constants';

export const pageToSkip = (page?: number, pageSize?: number) => {
	return ((page || 1) - 1) * (pageSize || DEFAULT_PAGE_SIZE);
};

export const addSuffixToFileName = (fileName: string, suffix: string) => {
	// Use a regex to match the last dot in the file name
	const regex = /(\.[^.]+)$/;

	// Replace the last dot with the suffix and the dot
	return fileName.replace(regex, `${suffix}$1`);
};
