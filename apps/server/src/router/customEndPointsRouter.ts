import { Router } from 'express';

import { endPoint } from '@/shared/lib/constants';

import { multerConfig } from '../lib/multer';
import protectionMiddleware from '../middlewares/protection.middleware';
import { handleUploadManyFiles, handleUploadSingleFile } from '../resources/file/file.controller';
import { handlePasswordLogin } from '../resources/user/user.controller';

const customEndPointsRouter = Router();
export default customEndPointsRouter;

// customEndPointsRouter.use((req, _res, next) => {
// 	try {
// 		const localeInHeaders = req.get(LOCALE_HEADER_KEY);
// 		const locale = getCorrectLocale(localeInHeaders);
// 		const t = getT(locale);
// 		const z = new CustomZod(t);

// 		req.locale = locale;
// 		req.t = t;
// 		req.z = z;

// 		return next();
// 	} catch (error) {
// 		return next(error);
// 	}
// });

customEndPointsRouter.post(
	endPoint.uploadSingleFile,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.single('file'),
	handleUploadSingleFile,
);

customEndPointsRouter.post(
	endPoint.uploadManyFiles,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.array('files'),
	handleUploadManyFiles,
);

customEndPointsRouter.post(endPoint.passwordLogin, handlePasswordLogin);
