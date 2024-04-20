import { Router } from 'express';

import { endPoint } from '@/shared/lib/constants';

import { multerConfig } from '../lib/multer';
import protectionMiddleware from '../middlewares/protection.middleware';
import { handleUploadManyFiles, handleUploadSingleFile } from '../resources/file/file.controller';
import { handlePasswordLogin } from '../resources/user/user.controller';

const customEndPointsRouter = Router();
export default customEndPointsRouter;

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

// const handleTest = expressEndpoint(async (req, res) => {
// 	console.log(req.path);
// 	res.send('Hello World');
// });

// customEndPointsRouter.get('/test', handleTest);
