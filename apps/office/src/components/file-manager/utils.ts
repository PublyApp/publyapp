import type { IFileManager, IFolderManager } from '@devist/ui-react/types/file';

import type { AppFile } from '@/shared/types/db/appFile.types';

export const appFileData = (file: AppFile): IFileManager => {
	const { mimeType: type, objectId: id, updatedAt: modifiedAt } = file;
	return {
		...file,
		id,
		type,
		tags: [],
		modifiedAt,
		isFavorited: false,
		shared: [],
	};
};

export const appFolderData = (folder: AppFile): IFolderManager => {
	const { mimeType: type, objectId: id, updatedAt: modifiedAt } = folder;
	return {
		...folder,
		id,
		type,
		tags: [],
		modifiedAt,
		isFavorited: false,
		shared: [],
	};
};
