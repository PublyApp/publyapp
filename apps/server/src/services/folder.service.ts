// import { USE_MASTER_KEY } from '@/server/lib/constants';

import { fileProvider } from '@/shared/lib/constants';
import { ParseAppFile } from '@/shared/lib/parse/classes/appFile.class';

type FolderServiceProps = {
	path?: string;
	sessionToken?: string;
};

export default class FolderService {
	path: string;

	sessionToken?: string;

	constructor({ path = '/', sessionToken }: FolderServiceProps = {}) {
		this.path = path;
		this.sessionToken = sessionToken;
	}

	async getByPath() {
		return new Parse.Query(ParseAppFile).equalTo('path', this.path).first({ sessionToken: this.sessionToken });
	}

	static async getByPath(path: string, options: { sessionToken?: string } = {}) {
		return new Parse.Query(ParseAppFile).equalTo('path', path).first({ sessionToken: options.sessionToken });
	}

	async saveOne({
		folderName,
		// parentFolderPath,
		newFolderName,
		newParentFolder,
	}: {
		folderName: string;
		// parentFolderPath?: string;
		// in case of an update
		newFolderName?: string;
		newParentFolder?: ParseAppFile;
	}) {
		const parentFolder = await this.getByPath();
		// const parentFolder = await FolderService.getByPath(parentFolderPath || '/');

		const foundAppFileFolder = await new Parse.Query(ParseAppFile)
			.equalTo('path', this.path + folderName)
			.first({ sessionToken: this.sessionToken });

		if (!foundAppFileFolder) {
			const appFileFolder = new ParseAppFile({
				name: folderName,
				provider: fileProvider.LOCAL,
				mimeType: 'folder',
				// path: this.path + folderName,
				path: `${this.path === '/' ? '' : this.path}/${folderName}`,
				folder: parentFolder,
			});

			return appFileFolder.save(null, { sessionToken: this.sessionToken });
		}

		if (newFolderName) {
			foundAppFileFolder.set('name', newFolderName);
		}

		if (newParentFolder) {
			foundAppFileFolder.set('folder', newParentFolder);
			foundAppFileFolder.set('path', (newParentFolder.get('path') || '/') + folderName);
		}

		return foundAppFileFolder.save(null, { sessionToken: this.sessionToken });
	}
}
