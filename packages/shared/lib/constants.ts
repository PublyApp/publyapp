import { imageFormatTypes } from '@/shared/types/appFile.types';

export type IRoleConfig = {
	name: string;
	code: number;
};

export const roleEnum = {
	ADMIN: { name: 'ADMIN', code: 12308120948 },
	MODERATOR: { name: 'MODERATOR', code: 21143141341 },
	AUTHOR: { name: 'AUTHOR', code: 7589243534538 },
	READER: { name: 'READER', code: 934525757347 },
} satisfies Record<string, IRoleConfig>;

export const roleSet = {
	ADMIN_ONLY: [roleEnum.ADMIN],
	ABOVE_MODERATOR: [roleEnum.MODERATOR, roleEnum.ADMIN],
	ABOVE_AUTHOR: [roleEnum.AUTHOR, roleEnum.MODERATOR, roleEnum.ADMIN],
	ALL: Object.values(roleEnum),
} satisfies Record<string, IRoleConfig[]>;

/**
 * Parse Server class names
 */
export const className = {
	USER: '_User',
	ROLE: '_Role',
	POST: 'Post',
	AI_TOOL: 'AITool',
	// WEB_HOSTING_PROVIDER: 'WebHostingProvider',
	WEB_HOST: 'WebHost',
	APP_FILE: 'AppFile',
	AWESOME_LINK: 'AwesomeLink',
} as const;

export const LOCALE_HEADER_KEY = 'xxx-app-i18n-locale';

export const FRONT_PATH_NAMES = {
	// dashboard: ROOTS.DASHBOARD,
	// webHosts: `${ROOTS.DASHBOARD}/web-hosts`,
	// createWebHost: `${ROOTS.DASHBOARD}/web-hosts/new`,
	// TODO: edit route
	home: '/',
	job: '/job',
	awesomeTools: '/awesome-tools',
} as const;

const ROOTS = {
	AUTH: '/auth',
	DASHBOARD: '/dashboard',
} as const;

export const BO_PATH_NAMES = {
	// home: '/',
	logIn: `${ROOTS.DASHBOARD}/login`,
	dashboard: ROOTS.DASHBOARD,
	webHosts: `${ROOTS.DASHBOARD}/web-hosts`,
	createWebHost: `${ROOTS.DASHBOARD}/web-hosts/new`,
	fileManager: `${ROOTS.DASHBOARD}/file-manager`,
} as const;

export const functionName = {
	getAITools: 'getAITools',
	createAITool: 'createAITool',
	// Web hosts
	saveWebHost: 'saveWebHost',
	findWebHost: 'findWebHost',
	// Files
	findAppFile: 'findAppFile',
	saveAppFileFolder: 'saveAppFileFolder',
} as const;

export const endPoint = {
	uploadSingleFile: '/upload-single-file',
	uploadManyFiles: '/upload-many-files',
} as const;

export const DEFAULT_PAGE_SIZE = 25;

export const isServer = typeof window === 'undefined';

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

export const fileProvider = {
	LOCAL: 'local',
};

export const PARSE_SESSION_TOKEN_HEADER_KEY = 'X-Parse-Session-Token';
export const DEVIST_REST_API_HEADER_KEY = 'X-Devist-Key';
