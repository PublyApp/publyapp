import multer from 'multer';
import { nanoid } from 'nanoid';

import { addSuffixToFileName } from './any.utils';
import { FILE_UPLOAD_DESTINATION } from './constants';

export const multerConfig = multer({
	storage: multer.diskStorage({
		destination: (_req, _file, cb) => {
			cb(null, FILE_UPLOAD_DESTINATION);
		},
		filename: (_req, file, cb) => {
			const uid = nanoid();
			Object.assign(file, { uid });

			cb(null, addSuffixToFileName(file.originalname, `_${uid}_@original`));
		},
	}),
});
