import { Router } from 'express';

import { endPoint } from '@/shared/lib/constants';

import { apiEndPoint } from '../lib/constants';
import { multerConfig } from '../lib/multer';
import protectionMiddleware from '../middlewares/protection.middleware';
import { handleVerification, handleWebHook } from '../resources/facebookMessenger/facebookMessenger.controller';
import { handleUploadManyFiles, handleUploadSingleFile } from '../resources/file/file.controller';
import { handlePasswordLogin } from '../resources/user/user.controller';

const customAPIRouter = Router();
export default customAPIRouter;

customAPIRouter.post(
	apiEndPoint.upload.single,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.single('file'),
	handleUploadSingleFile,
);

customAPIRouter.post(
	apiEndPoint.upload.many,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.array('files'),
	handleUploadManyFiles,
);

customAPIRouter.post(apiEndPoint.auth.passwordLogin, handlePasswordLogin);

// ==============
customAPIRouter.post(endPoint.facebookMessengerBotWebHook, handleWebHook);
customAPIRouter.get(endPoint.facebookMessengerBotWebHook, handleVerification);
