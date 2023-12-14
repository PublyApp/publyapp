import { USE_MASTER_KEY } from '@/server/lib/constants';
import { ParseAppFile } from '@/shared/lib/parse/classes/appFile.class';

type FolderServiceProps = {
	path?: string;
};

export default class FolderService {
	path = '/';

	constructor({ path }: FolderServiceProps) {
		if (path) {
			this.path = path;
		}
	}

	async getByPath() {
		return new Parse.Query(ParseAppFile).equalTo('path', this.path).first(USE_MASTER_KEY);
	}
}
