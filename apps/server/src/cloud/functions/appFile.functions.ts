import { DEFAULT_PAGE_SIZE, functionName } from '@devist/shared/lib/constants';

import { parseFrom } from '@/server/lib/parse';
import FileService from '@/server/services/file.service';
import FolderService from '@/server/services/folder.service';

Parse.Cloud.define(
	functionName.findAppFile,
	parseFrom({
		requireUser: false,
		action: async ({ /* t, */ req }) => {
			// logger.info(req);
			const { pageSize, page, folderPath } = req.params;

			const folderService = new FolderService({ path: folderPath });
			const folder = await folderService.getByPath();
			const fileService = new FileService({ folder });

			return fileService.listFiles({ pageSize: pageSize || DEFAULT_PAGE_SIZE, page: page || 1, json: true });
		},
	}),
);
