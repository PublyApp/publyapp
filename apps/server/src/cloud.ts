import { logger } from '@/server/lib/winston';
import { parseFunction } from './lib/parse/function.utils';

const functions = async () => {
	Parse.Cloud.define(
		'hello',
		parseFunction(async (_req) => {
			return 'Hello world!';
		}),
	);

	await Promise.all([
		// ====== common modules ======
		import('@/server/modules/common/auth/auth.functions'),
		// ====== staff modules =======
		import('@/server/modules/staff/staff-member/staff-member.functions'),
		// ====== tenant modules ======
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
