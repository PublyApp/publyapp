import { HttpException } from '@/server/exceptions/HttpException';
import { expressHandler, getRequestUtils } from '@/server/lib/express';

import FileService from './file.service';
import _ from 'lodash';
import { getMulterMemoryFileSchema } from '@/shared/validations/file/file-server.validations';
import { fileProvider } from '@/shared/lib/constants';

export const handleUploadSingleFile = expressHandler(async (req, res) => {
	const { z, t } = getRequestUtils(req);

	const file = getMulterMemoryFileSchema(z).parse(req.file);

	const { provider, folderPath } = z
		.object({
			folderPath: z.string().optional(),
			provider: z.enum([fileProvider.CLOUDFLARE]),
		})
		.parse(req.body);

	const sessionToken = req.user?.getSessionToken();

	const uploadAdapter = FileService.uploadAdapterMap.get(provider as never);

	if (!uploadAdapter) {
		throw new HttpException(500, t('Error while uploading file'));
	}

	const fileService = new FileService({ sessionToken, uploadAdapter });

	const result = await fileService.uploadOne({
		file,
		storageFrom: 'memory',
		folderPath,
	});

	res.status(201).send(result);
});

export const handleUploadManyFiles = expressHandler(async (_req, _res) => {
	throw new HttpException(500, 'Not implemented yet');
	// const { z } = getRequestUtils(req);
	// const files = getMulterFilesArraySchema(z).parse(req.files);

	// const { folderPath, provider } = req.body;

	// const sessionToken = req.user?.getSessionToken();

	// const uploadAdapter =
	// 	FileService.uploadAdapterMap.get(provider);

	// const fileService = new FileService({ sessionToken, uploadAdapter });

	// const results = await fileService.uploadMany({
	// 	files,
	// 	folderPath: parentFolderPath,
	// });

	// res.status(201).send(results);
});
