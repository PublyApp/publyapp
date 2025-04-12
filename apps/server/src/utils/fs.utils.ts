import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const getCurrentFilenameESM = (fileUrl: string) => {
	return fileURLToPath(fileUrl);
};

export const getCurrentFolderNameESM = (fileUrl: string) => {
	const __filename = getCurrentFilenameESM(fileUrl);
	return path.dirname(__filename);
};
