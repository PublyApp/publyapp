export enum RolesEnum { // TODO: convert into const expression
	ADMIN = 12308120948,
	MODERATOR = 21143141341,
	AUTHOR = 7589243534538,
	READER = 934525757347,
}

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
} as const;

export const LOCALE_HEADER_KEY = 'xxx-app-i18n-locale';

export const FRONT_PATH_NAMES = {
	// dashboard: ROOTS.DASHBOARD,
	// webHosts: `${ROOTS.DASHBOARD}/web-hosts`,
	// createWebHost: `${ROOTS.DASHBOARD}/web-hosts/new`,
	// TODO: edit route
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
} as const;

export const functionName = {
	getAITools: 'getAITools',
	createAITool: 'createAITool',
	// createWebHost: 'createWebHost',
	saveWebHost: 'saveWebHost',
	findWebHost: 'findWebHost',
	uploadFile: 'uploadFile',
} as const;

export const DEFAULT_PAGE_SIZE = 25;

export const isServer = typeof window === 'undefined';
