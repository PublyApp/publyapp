import { Router } from 'express';

import { endPoint } from '@/shared/lib/constants';

import { multerConfig } from '../lib/multer';
import protectionMiddleware from '../middlewares/protection.middleware';
import { handlePasswordLogin, handlePasswordSignup, handleVerifyEmail } from '../modules/common/auth/auth.controller';
import { handleUploadManyFiles, handleUploadSingleFile } from '../modules/tenant/file-manager/fileManager.controller';

const coreApiRouter = Router();
export default coreApiRouter;

// --------------------------------------------------------------------------------------//
//                                     File uploads                                     //
// --------------------------------------------------------------------------------------//
coreApiRouter.post(
	endPoint.api.upload.single,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.single('file'),
	handleUploadSingleFile,
);

coreApiRouter.post(
	endPoint.api.upload.many,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multerConfig.array('files'),
	handleUploadManyFiles,
);

// --------------------------------------------------------------------------------------//
//                                    Password auth                                      //
// ------------------------------------------------------------------------------------ -//
coreApiRouter.post(endPoint.api.auth.passwordLogin, handlePasswordLogin);
coreApiRouter.post(endPoint.api.auth.passwordSignup, handlePasswordSignup);
coreApiRouter.get(endPoint.api.auth.verifyEmail, handleVerifyEmail);
