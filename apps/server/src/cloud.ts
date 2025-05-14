import { logger } from '@/server/lib/winston';
import { parseFunction } from './lib/parse/function.utils';

const functions = async () => {
	Parse.Cloud.define(
		'hello',
		parseFunction(async (req) => {
			req.log.info('hello function hit 💀💀💀💀💀', {
				// type: req.params.avatar instanceof File,
				// file: req.file,
				// req,
				context: req.context,
				header: req.headers,
			});
			return 'Hello world!';
		}),
	);

	await Promise.all([
		// =================
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
