import { Router } from 'express';
import { endPoint } from '@/shared/lib/constants';
import protectionMiddleware from '../middlewares/protection.middleware';
import {
	handlePasswordLogin,
	handlePasswordSignup,
	handleVerifyEmail,
} from '../modules/common/auth/auth.controller';
import {
	handleUploadManyFiles,
	handleUploadSingleFile,
} from '../modules/common/file/file.controller';
import multer from 'multer';
import { mbToBytes } from '@/shared/utils/any.utils';

const coreApiRouter = Router();
export default coreApiRouter;

// --------------------------------------------------------------------------------------//
//                                     File uploads                                      //
// --------------------------------------------------------------------------------------//
coreApiRouter.post(
	endPoint.api.upload.single,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: mbToBytes(16) },
	}).single('file'),
	handleUploadSingleFile,
);

coreApiRouter.post(
	endPoint.api.upload.many,
	protectionMiddleware({ withAuth: true, withKey: false }),
	multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: mbToBytes(16) },
	}).array('files'),
	handleUploadManyFiles,
);

// --------------------------------------------------------------------------------------//
//                                    Password auth                                      //
// ------------------------------------------------------------------------------------ -//
coreApiRouter.post(endPoint.api.auth.passwordLogin, handlePasswordLogin);
coreApiRouter.post(endPoint.api.auth.passwordSignup, handlePasswordSignup);
coreApiRouter.get(endPoint.api.auth.verifyEmail, handleVerifyEmail);
