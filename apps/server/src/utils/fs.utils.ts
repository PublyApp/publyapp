import path from 'path';
import { fileURLToPath } from 'url';

export const getCurrentFilenameESM = (fileUrl: string) => {
	return fileURLToPath(fileUrl);
};

export const getCurrentFolderNameESM = (fileUrl: string) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const __filename = getCurrentFilenameESM(fileUrl);
	return path.dirname(__filename);
};
