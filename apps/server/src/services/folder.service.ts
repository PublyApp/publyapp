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

	private currentAppFileFolder?: ParseAppFile;

	constructor({ path = '/', sessionToken }: FolderServiceProps = {}) {
		this.path = path;
		this.sessionToken = sessionToken;
	}

	async getByPath() {
		if (!this.currentAppFileFolder) {
			this.currentAppFileFolder = await new Parse.Query(ParseAppFile)
				.equalTo('path', this.path)
				.first({ sessionToken: this.sessionToken });
		}

		return this.currentAppFileFolder;
	}

	static async getByPath(path: string, options: { sessionToken?: string } = {}) {
		return new Parse.Query(ParseAppFile).equalTo('path', path).first({ sessionToken: options.sessionToken });
	}

	async saveOne({
		folderName,
		newFolderName,
		newParentFolder,
	}: {
		folderName: string;
		newFolderName?: string;
		newParentFolder?: ParseAppFile;
	}) {
		const parentFolder = await this.getByPath();

		const foundAppFileFolder = await new Parse.Query(ParseAppFile)
			.equalTo('path', this.path + folderName)
			.first({ sessionToken: this.sessionToken });

		if (!foundAppFileFolder) {
			const appFileFolder = new ParseAppFile({
				name: folderName,
				provider: fileProvider.LOCAL,
				mimeType: 'folder',
				path: this.path + folderName,
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
