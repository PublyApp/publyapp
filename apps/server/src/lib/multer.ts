import { createId } from '@paralleldrive/cuid2';
import _ from 'lodash';
import multer from 'multer';

import { addSuffixToFileName } from '../utils/any.utils';

import { FILE_UPLOAD_DESTINATION } from './constants';

export const multerConfig = multer({
	storage: multer.diskStorage({
		destination: (_req, _file, cb) => {
			cb(null, FILE_UPLOAD_DESTINATION);
		},
		filename: (_req, file, cb) => {
			const uid = createId();
			// Object.assign(file, { uid });
			_.assign(file, { uid });
			// _.set(file, 'uid', uid);

			cb(null, addSuffixToFileName(file.originalname, `_${uid}_@original`));
		},
	}),
});
