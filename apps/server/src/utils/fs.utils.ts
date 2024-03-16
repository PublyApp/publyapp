import path from 'path';
import { fileURLToPath } from 'url';

export const getCurrentFilenameESM = () => {
	return fileURLToPath(import.meta.url);
};

export const getCurrentFolderNameESM = () => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const __filename = getCurrentFilenameESM();
	return path.dirname(__filename);
};
