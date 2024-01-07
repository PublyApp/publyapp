import _ from 'lodash';

import { fileProvider } from '@/shared/lib/constants';
import { ParseAppFile } from '@/shared/lib/parse/classes/appFile.class';

type FolderServiceProps = {
	sessionToken: string | undefined;
};

type CreateFolderInput = {
	name: string;
	parentFolder?: ParseAppFile;
};

export default class FolderService {
	sessionToken?: string;

	constructor({ sessionToken }: FolderServiceProps) {
		this.sessionToken = sessionToken;
	}

	static getPathForFolder(folder: ParseAppFile | undefined): string {
		if (!FolderService.isFolder(folder)) {
			throw new Error("[FolderService.getPathForFolder]: folder mimeType must be 'folder'");
		}

		return folder?.get('path') ?? '/';
	}

	static isFolder(appFileFolder: ParseAppFile | undefined) {
		if (_.isNil(appFileFolder)) {
			// we consider this is the root folder: root folder does not have a db document
			return true;
		}

		return appFileFolder.get('mimeType') === 'folder';
	}

	async getByPath(path: string | undefined) {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		const _path = path || '/';
		return new Parse.Query(ParseAppFile)
			.equalTo('path', _path)
			.equalTo('mimeType', 'folder')
			.first({ sessionToken: this.sessionToken });
	}

	async createOne({ name, parentFolder }: CreateFolderInput) {
		const parentFolderPath = FolderService.getPathForFolder(parentFolder);
		const path = parentFolderPath === '/' ? parentFolderPath + name : `${parentFolderPath}/${name}`;

		const foundAppFileFolder = await new Parse.Query(ParseAppFile)
			.equalTo('path', path)
			.first({ sessionToken: this.sessionToken });

		if (foundAppFileFolder) {
			throw new Error('A folder with the same name already exists in this directory');
		}

		const appFileFolder = new ParseAppFile({
			name,
			provider: fileProvider.LOCAL,
			mimeType: 'folder',
			path,
			folder: parentFolder,
		});

		return appFileFolder.save(null, { sessionToken: this.sessionToken });
	}
}
