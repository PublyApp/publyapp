/* eslint-disable @typescript-eslint/no-use-before-define */
// import { nanoid } from 'nanoid';

import logger from './lib/logger';

// import TenantQuery from './lib/parse/classes/TenantQuery';

export const cloud = async () => {
	try {
		// Parse.Cloud.define('testContextInBeforeFind-create', async (req) => {
		// 	// const a = new Parse.Object('Dummy', { attr1: 'test' });
		// 	// a.id = 'TGboiCeYDs';

		// 	// const objs = ['TGboiCeYDs', 'l8wFQ8Rsar'].map((id) => {
		// 	// 	return new Parse.Object('Dummy', { objectId: id, attr1: nanoid(4) });
		// 	// });
		// 	const objs = await new /* Parse.Query */ TenantQuery({
		// 		className: 'Dummy',
		// 		tenantId: 'ok',
		// 	}).findAll(/* { context: { tenantId: 'ok' } } */);

		// 	// objs.forEach((obj) => {
		// 	// 	obj.set('attr1', nanoid(4));
		// 	// });

		// 	// const newObjs = await Parse.Object.saveAll(objs);

		// 	// const obj1 = newObjs[0];
		// 	// obj1.set('attr1', nanoid(2));
		// 	// await obj1.save();
		// });

		// Parse.Cloud.beforeFind('Dummy', (req) => {
		// 	console.log('⭕⭕⭕⭕', req.query instanceof Parse.Query);
		// });

		// Parse.Cloud.beforeSave('Dummy', (req) => {
		// 	console.log('⭕⭕⭕⭕');
		// });

		await Promise.all([functions(), triggers(), jobs()]);
	} catch (error) {
		logger.error('Error while importing cloud code:', error);
		process.exit(1);
	}
};

const functions = async () => {
	await Promise.all([
		// =================
		import('@/server/resources/blog/blog.functions'),
		import('@/server/resources/file-manager/appFile/appFile.functions'),
		import('@/server/resources/auth/auth.functions'),
		// import('../resources/aiTool/aiTool.functions'),
		// import('../resources/webHost/webHost.functions'),
	]);
};

const triggers = async () => {
	await Promise.all([
		// =================
		import('@/server/resources/auth/auth.triggers'),
	]);
};

const jobs = async () => {
	await Promise.all([
		// =================
		import('@/server/resources/blog/blog.jobs'),
	]);
};
