// import { createId } from '@paralleldrive/cuid2';
import _ from 'lodash';
import multer from 'multer';
import { nanoid } from 'nanoid';

import { addSuffixToFileName } from '../utils/any.utils';

import { FILE_UPLOAD_DESTINATION } from './constants';

export const multerConfig = multer({
	storage: multer.diskStorage({
		destination: (_req, _file, cb) => {
			cb(null, FILE_UPLOAD_DESTINATION);
		},
		filename: (_req, file, cb) => {
			// const uid = createId();
			const uid = nanoid();
			_.assign(file, { uid });

			cb(null, addSuffixToFileName(file.originalname, `_${uid}_@original`));
		},
	}),
});
