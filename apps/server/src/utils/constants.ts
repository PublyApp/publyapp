import path from 'path';

import type { SchemaMigrations } from 'parse-server';

import { imageFormatTypes } from '@shared/types/appFile.types';

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
	],
	ONLINE: [
		'https://devist.xyz',
		'https://www.devist.xyz',
		'https://app.devist.xyz',
		'https://bo.devist.xyz',
		'engine://www.devist.xyz',
	], // ? We're gonna see over time
};

export const USE_MASTER_KEY = { useMasterKey: true } as const;

/**
 * Parse server strict class level permissions
 */
export const DEFAULT_CLP: SchemaMigrations.CPLsInterface = {};

export const READONLY_CLP: SchemaMigrations.CPLsInterface = {
	find: {
		'*': true,
	},
	get: {
		'*': true,
	},
	count: {
		'*': true,
	},
	// create: {
	// 	requiresAuthentication: true,
	// },
	// update: {
	// 	requiresAuthentication: true,
	// },
};

export const FILE_UPLOAD_DESTINATION = path.join(process.cwd(), 'files/multer-uploads');

export const IMAGE_FORMAT_CONFIG = {
	[imageFormatTypes[0]]: {
		width: 100,
		height: 100,
	},
	[imageFormatTypes[1]]: {
		width: 200,
		height: 200,
	},
	[imageFormatTypes[2]]: {
		width: 300,
		height: 300,
	},
	[imageFormatTypes[3]]: {
		width: 400,
		height: 400,
	},
};
