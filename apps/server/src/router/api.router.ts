import { Router } from 'express';

import { endPoint } from '@/shared/lib/constants';

import { apiEndPoint } from '../lib/constants';
import { multerConfig } from '../lib/multer';
import protectionMiddleware from '../middlewares/protection.middleware';
import { handlePasswordLogin, handlePasswordSignup, handleVerifyEmail } from '../modules/common/auth/auth.controller';
import { handleUploadManyFiles, handleUploadSingleFile } from '../modules/tenant/file-manager/fileManager.controller';
import {
	handleVerification,
	handleWebHook,
} from '../modules/tenant/social-media/facebookMessenger/facebookMessenger.controller';

const customApiRouter = Router();
export default customApiRouter;

// --------------------------------------------------------------------------------------//
//                                     File uploads                                     //
// --------------------------------------------------------------------------------------//
customApiRouter.post(
	apiEndPoint.upload.single,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.single('file'),
	handleUploadSingleFile,
);

customApiRouter.post(
	apiEndPoint.upload.many,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.array('files'),
	handleUploadManyFiles,
);

// --------------------------------------------------------------------------------------//
//                                    Password auth                                     //
// --------------------------------------------------------------------------------------//
customApiRouter.post(apiEndPoint.auth.passwordLogin, handlePasswordLogin);
customApiRouter.post(apiEndPoint.auth.passwordSignup, handlePasswordSignup);
customApiRouter.get(apiEndPoint.auth.verifyEmail, handleVerifyEmail);

// --------------------------------------------------------------------------------------//
//                         Experiments: facebook messenger bot                          //
// --------------------------------------------------------------------------------------//
customApiRouter.post(endPoint.facebookMessengerBotWebHook, handleWebHook);
customApiRouter.get(endPoint.facebookMessengerBotWebHook, handleVerification);
