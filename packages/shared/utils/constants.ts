export enum RolesEnum {
	ADMIN = 12308120948,
	MODERATOR = 21143141341,
	AUTHOR = 7589243534538,
	READER = 934525757347,
}

/**
 * Parse Server class names
 */
export const classNames = {
	USER: '_User',
	ROLE: '_Role',
	POST: 'Post',
} as const;

export const I18N_LOCALE_KEY = 'xxx-app-i18n-locale';

export const FRONT_PATH_NAMES = {
	home: '/',
	aiTools: 'ai-tools',
} as const;

export const BO_PATH_NAMES = {
	home: '/',
	logIn: '/login',
} as const;
