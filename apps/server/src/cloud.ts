import { logger } from '@/server/lib/winston';

const functions = async () => {
	await Promise.all([
		// =================
		import('@/server/modules/tenant/file-manager/appFile/appFile.functions'),
		import('@/server/modules/common/auth/auth.functions'),
	]);
};

const triggers = async () => {
	await Promise.all([
		// =================
		import('@/server/modules/common/auth/auth.triggers'),
		import('@/server/modules/common/auth/role/role.triggers'),
	]);
};

const jobs = async () => {
	await Promise.all([
		// =================
	]);
};

export const cloud = async () => {
	try {
		await Promise.all([functions(), triggers(), jobs()]);
	} catch (error) {
		logger.error('Error while importing cloud code:', error);
		process.exit(1);
	}
};
