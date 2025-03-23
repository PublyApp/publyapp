import path from 'path';

import type { CPLsInterface } from 'parse-server';

import { endPoint } from '@/shared/lib/constants';

import { env } from './env';

export const ADMIN_EMAILS = ['radandevist@gmail.com'];

// Cors white lists
export const corsWhiteList = {
	LOCAL: [
		// server domain
		'http://localhost:6180',
		'http://127.0.0.1:6180',
		'http://127.0.0.0:6180',
		'http://[::1]:6180',
		// front domain
		'http://localhost:6181',
		'http://127.0.0.1:6181',
		'http://127.0.0.0:6181',
		'http://[::1]:6181',
	],
	ONLINE: [
		// Since the client builds arse served by the same server, the front and server domains are the same
		new URL(env.SERVER_URL).origin,
		'http://localhost:6180', // test online (for emulating online environment from local)
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
		// requiresAuthentication: true, // ! in fact we don't want to delete anything, only do soft delete
	},
	addField: {
		requiresAuthentication: true,
	},
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

// Parse server's global config (saved in the database) utilities
export const DISABLE_SIGNUP_CONFIG_KEY = 'disableSignup';

export const CLOUD_INSTALLATION_ID = '7_UTZsD3OTKZFC4ifcvHbGVwthv8yh8GMlTm';

export const EXPRESS_FILES_MOUNT_PATH = '/app/files';

export const PARSE_SERVER_URL = new URL(env.SERVER_URL);
PARSE_SERVER_URL.pathname = endPoint.api.parse.root;
