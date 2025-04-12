import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const getCurrentFilenameESM = (fileUrl: string) => {
	return fileURLToPath(fileUrl);
};

export const getCurrentFolderNameESM = (fileUrl: string) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const __filename = getCurrentFilenameESM(fileUrl);
	return path.dirname(__filename);
};
