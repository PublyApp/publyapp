import path from 'path';

import type { CPLsInterface } from 'parse-server';

export const ADMIN_EMAILS = ['radandevist@gmail.com'];

// Cors white lists
export const corsWhiteList = {
	LOCAL: [
		'http://localhost:6180',
		'http://localhost:6181',
		'http://localhost:6182',
		'http://localhost:6183',
		'http://localhost:6184',
		'http://localhost:6185',
		'http://localhost:5173',
		'http://localhost:4040',
		'http://localhost:3000',
	],
	ONLINE: [
		'https://devist.xyz',
		'https://www.devist.xyz',
		'https://app.devist.xyz',
		'https://bo.devist.xyz',
		'https://engine.devist.xyz',
		'https://engine2.devist.xyz',
		'https://awesome.devist.xyz',
		'https://amazing.devist.xyz',
		'http://localhost:4040',
		// test online
		'http://localhost:6180',
	], // ? We're gonna see over time
};

export const USE_MASTER_KEY = { useMasterKey: true } as const;

/**
 * Parse server strict class level permissions
 */
export const DEFAULT_CLP: CPLsInterface = {
	find: {
		'*': true,
	},
	get: {
		'*': true,
	},
	count: {
		'*': true,
	},
	create: {
		requiresAuthentication: true,
	},
	update: {
		requiresAuthentication: true,
	},
	delete: {
		requiresAuthentication: true,
	},
	// addField: {
	// 	requiresAuthentication: true,
	// },
};

export const PUBLIC_READONLY_CLP: CPLsInterface = {
	find: {
		'*': true,
	},
	get: {
		'*': true,
	},
	count: {
		'*': true,
	},
};

export const AUTHED_READONLY_CLP: CPLsInterface = {
	find: {
		requiresAuthentication: true,
	},
	get: {
		requiresAuthentication: true,
	},
	count: {
		requiresAuthentication: true,
	},
};

export const FILE_UPLOAD_DESTINATION = path.join(process.cwd(), 'files/multer-uploads');
