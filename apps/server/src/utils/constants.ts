import type { SchemaMigrations } from 'parse-server';

export const ADMIN_EMAILS = ['radandevist@gmail.com'];

// Cors white lists
export const whiteList = {
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
export const DEFAULT_STRICT_CLP: SchemaMigrations.CPLsInterface = {
	find: {
		'*': true,
	},
	get: {
		'*': true,
	},
	// count: {
	// 	'*': true,
	// },
	create: {
		requiresAuthentication: true,
	},
	update: {
		requiresAuthentication: true,
	},
};
