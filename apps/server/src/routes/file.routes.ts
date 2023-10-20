import { Router } from 'express';
import multer from 'multer';

import FileController from '@server/controllers/file.controller';
import type { Routes } from '@server/interfaces/Routes';
import protectionMiddleware from '@server/middlewares/protection.middleware';

// import protectionMiddleware from "@/middlewares/protection.middleware";
// import { MAX_FILES_UPLOAD } from "@/utils/constants";
// import type { Routes } from '@interfaces/routes.interface';

// use local disk for multer uploaded files
// it's just temporary, after it uploaded to the cloud (cloudinary), the local files will be deleted
export const multerConfig = multer({
	storage: multer.memoryStorage(),
});

const MAX_FILES_UPLOAD = 2; // TODO

// import { multerConfig } from '@/config';
// import FilesController from '@/controllers/files.controller';

class FilesRoute implements Routes {
	public path = '/files';

	public router = Router();

	constructor() {
		this.initializeRoutes();
	}

	private initializeRoutes() {
		// upload single file route
		this.router.post(this.path, protectionMiddleware({}), multerConfig.single('file'), FileController.uploadFile);

		// upload multiple files route
		this.router.post(
			`${this.path}/multiple`,
			protectionMiddleware({}),
			multerConfig.array('files', MAX_FILES_UPLOAD),
			FileController.uploadFiles,
		);
	}
}

export default FilesRoute;
