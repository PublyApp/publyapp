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
} as const;

export const I18N_LOCALE_KEY = 'xxx-app-i18n-locale';

export const FRONT_PATH_NAMES = {
	home: '/',
	aiTools: 'ai-tools',
	webHosts: 'web-hosts',
} as const;

export const BO_PATH_NAMES = {
	home: '/',
	logIn: '/login',
} as const;

export const functionName = {
	getAITools: 'getAITools',
	createAITool: 'createAITool',
	// createWebHost: 'createWebHost',
	saveWebHost: 'saveWebHost',
	getWebHosts: 'getWebHosts',
} as const;

export const DEFAULT_PAGE_SIZE = 25;

export const isServer = typeof window === 'undefined';
