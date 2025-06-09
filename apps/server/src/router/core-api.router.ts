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
import { createStaffMember } from '../modules/staff/staff-member/staff-member.functions';
import { createExpressHandler } from '../lib/parse/cloud/function';
import { expressHandler } from '../lib/express';
import _ from 'lodash';
import { createTenant } from '../modules/staff/tenant/tenant.functions';

const coreApiRouter = Router();
export default coreApiRouter;

// --------------------------------------------------------------------------------------//
//                                     File uploads                                      //
// --------------------------------------------------------------------------------------//
coreApiRouter.post(
	endPoint.api.upload.single,
	protectionMiddleware.fromAuthedUser({}),
	multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: mbToBytes(16) },
	}).single('file'),
	handleUploadSingleFile,
);

coreApiRouter.post(
	endPoint.api.upload.many,
	protectionMiddleware.fromAuthedUser({}),
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

// --------------------------------------------------------------------------------------//
//                                    Email verification                                 //
// --------------------------------------------------------------------------------------//
coreApiRouter.get(endPoint.api.auth.verifyEmail, handleVerifyEmail);

// --------------------------------------------------------------------------------------//
//                           Parse functions as Express handlers                         //
// --------------------------------------------------------------------------------------//
const handleCreateStaffMember = createExpressHandler(createStaffMember);
coreApiRouter.post(
	handleCreateStaffMember.path,
	...handleCreateStaffMember.middlewares,
	multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: mbToBytes(3) },
	}).single('avatar'),
	expressHandler(async (req, _res, next) => {
		_.set(req, 'headers.__avatar__', req.file);
		next();
	}),
	handleCreateStaffMember,
);

const handleCreateTenant = createExpressHandler(createTenant);
coreApiRouter.post(
	handleCreateTenant.path,
	...handleCreateTenant.middlewares,
	multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: mbToBytes(3) },
	}).single('logo'),
	expressHandler(async (req, _res, next) => {
		_.set(req, 'headers.__logo__', req.file);
		next();
	}),
	handleCreateTenant,
);
