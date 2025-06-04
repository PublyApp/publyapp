import { DEFAULT_PAGE_SIZE } from '@/shared/lib/constants';
import path from 'node:path';
import { newObjectId } from 'parse-server/lib/cryptoUtils.js';

export const pageToSkip = (page?: number, pageSize?: number) => {
	return ((page || 1) - 1) * (pageSize || DEFAULT_PAGE_SIZE);
};

export const addSuffixToFileName = (fileName: string, suffix: string) => {
	// Use a regex to match the last dot in the file name
	const regex = /(\.[^.]+)$/;

	// Replace the last dot with the suffix and the dot
	return fileName.replace(regex, `${suffix}$1`);
};

export const appendHashToFilename = (originalName: string): string => {
	const dir = path.dirname(originalName); // e.g., "/path/to/images"
	const ext = path.extname(originalName); // e.g., ".jpg"
	const base = path.basename(originalName, ext); // e.g., "photo"
	const hash = newObjectId(8); // short unique ID (e.g., "a1b2c3d4")
	// return `${dirname}${base}-${hash}${ext}`;
	const newFileName = `${base}-${hash}${ext}`;
	return path.posix.join(dir, newFileName);
};
