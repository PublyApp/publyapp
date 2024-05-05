import { Router } from 'express';

import { endPoint } from '@/shared/lib/constants';

import { multerConfig } from '../lib/multer';
import protectionMiddleware from '../middlewares/protection.middleware';
import { handleVerification, handleWebHook } from '../resources/facebookMessenger/facebookMessenger.controller';
import { handleUploadManyFiles, handleUploadSingleFile } from '../resources/file/file.controller';
import { handlePasswordLogin } from '../resources/user/user.controller';

const customAPIRouter = Router();
export default customAPIRouter;

customAPIRouter.post(
	endPoint.api.upload.single,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.single('file'),
	handleUploadSingleFile,
);

customAPIRouter.post(
	endPoint.api.upload.many,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.array('files'),
	handleUploadManyFiles,
);

customAPIRouter.post(endPoint.api.auth.passwordLogin, handlePasswordLogin);

// ==============
customAPIRouter.post(endPoint.facebookMessengerBotWebHook, handleWebHook);
customAPIRouter.get(endPoint.facebookMessengerBotWebHook, handleVerification);
