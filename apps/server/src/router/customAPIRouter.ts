import { Router } from 'express';

import { endPoint } from '@/shared/lib/constants';

import { multerConfig } from '../lib/multer';
import protectionMiddleware from '../middlewares/protection.middleware';
import { handleVerification, handleWebHook } from '../resources/facebookMessenger/facebookMessenger.controller';
import { handleUploadManyFiles, handleUploadSingleFile } from '../resources/file/file.controller';
import { handlePasswordLogin } from '../resources/user/user.controller';

const customEndPointsRouter = Router();
export default customEndPointsRouter;

customEndPointsRouter.post(
	endPoint.api.upload.single,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.single('file'),
	handleUploadSingleFile,
);

customEndPointsRouter.post(
	endPoint.api.upload.many,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.array('files'),
	handleUploadManyFiles,
);

customEndPointsRouter.post(endPoint.api.auth.passwordLogin, handlePasswordLogin);

customEndPointsRouter.post(endPoint.facebookMessengerBotWebHook, handleWebHook);
customEndPointsRouter.get(endPoint.facebookMessengerBotWebHook, handleVerification);

// const handleTest = expressEndpoint(async (req, res) => {
// 	console.log(req.path);
// 	res.send('Hello World');
// });

// customEndPointsRouter.get('/test', handleTest);
