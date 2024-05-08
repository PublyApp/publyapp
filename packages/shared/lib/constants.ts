import _ from 'lodash';

import { imageFormatTypes } from '@/shared/types/db/appFile.types';

// import { checkIsBrowser, checkIsServer } from '../utils/env.utils';

export type IRoleConfig = {
	name: string;
	code: number;
};

export const roleEnum = {
	STAFF_ADMIN: { name: 'STAFF_ADMIN', code: 23109870572456 } as const,
	STAFF_EDITOR: { name: 'STAFF_EDITOR', code: 49360279358027 } as const,
	STAFF_USER: { name: 'STAFF_USER', code: 3445632345235435 } as const,
	STAFF_CONTRIBUTOR: { name: 'STAFF_CONTRIBUTOR', code: 8945454534244523 } as const,
	// =======================================================
	TENANT_ADMIN: { name: 'TENANT_ADMIN', code: 12308120948 } as const,
	TENANT_EDITOR: { name: 'TENANT_EDITOR', code: 21143141341 } as const,
	TENANT_USER: { name: 'TENANT_USER', code: 7589243534538 } as const,
	TENANT_CONTRIBUTOR: { name: 'TENANT_CONTRIBUTOR', code: 934525757347 } as const,
	// =======================================================
	AUTHED_USER: { name: 'AUTHED_USER', code: 94353424535348 } as const,
} satisfies Record<string, IRoleConfig>;

const STAFF_ADMIN_ONLY = [roleEnum.STAFF_ADMIN]; /* as const */
const ABOVE_STAFF_EDITOR = [...STAFF_ADMIN_ONLY, roleEnum.STAFF_EDITOR]; /* as const */
const ABOVE_STAFF_USER = [...ABOVE_STAFF_EDITOR, roleEnum.STAFF_USER]; /* as const */
const ABOVE_STAFF_CONTRIBUTOR = [...ABOVE_STAFF_USER, roleEnum.STAFF_CONTRIBUTOR]; /* as const */
const ABOVE_TENANT_ADMIN = [...ABOVE_STAFF_CONTRIBUTOR, roleEnum.TENANT_ADMIN]; /* as const */
const ABOVE_TENANT_EDITOR = [...ABOVE_TENANT_ADMIN, roleEnum.TENANT_EDITOR]; /* as const */
const ABOVE_TENANT_USER = [...ABOVE_TENANT_EDITOR, roleEnum.TENANT_USER]; /* as const */
const ABOVE_TENANT_CONTRIBUTOR = [...ABOVE_TENANT_USER, roleEnum.TENANT_CONTRIBUTOR]; /* as const */
const ALL = [...ABOVE_TENANT_CONTRIBUTOR, roleEnum.AUTHED_USER]; /* as const */

export const roleSet = {
	STAFF_ADMIN_ONLY,
	ABOVE_STAFF_EDITOR,
	ABOVE_STAFF_USER,
	ABOVE_STAFF_CONTRIBUTOR,
	ABOVE_TENANT_ADMIN,
	ABOVE_TENANT_EDITOR,
	ABOVE_TENANT_USER,
	ABOVE_TENANT_CONTRIBUTOR,
	ALL,
} satisfies Record<string, IRoleConfig[]>;

/**
 * Parse Server class names (collection names)
 */
export const className = {
	USER: '_User',
	ROLE: '_Role',
	SESSION: '_Session',
	// =====================
	// === Multi Tenancy ===
	TENANT: 'Tenant',
	// === Custom classes ===
	POST: 'Post',
	POST_SERIES: 'PostSeries',
	WEB_HOST: 'WebHost',
	APP_FILE: 'AppFile',
	// ==== not use anymore
	// AI_TOOL: 'AITool',
	// WEB_HOSTING_PROVIDER: 'WebHostingProvider',
	// AWESOME_LINK: 'AwesomeLink',
} as const;

export const LOCALE_HEADER_KEY = 'X-Devist-Locale';
export const TENANT_ID_HEADER_KEY = 'X-Devist-TenantId';

const RESOURCE = {
	posts: 'posts',
	fileManager: 'file-manager',
	blog: 'blog',
} as const;

const makePath = (...params: string[]) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _params: string[] = [];

	params.forEach((param /* , index */) => {
		if (param.length <= 0 || param === '/') {
			return;
		}

		_params.push(param);
	});

	let path = _params.join('/').replace(/\/{2,}/g, '/');

	if (!path.startsWith('/')) {
		path = `/${path}`;
	}

	return path;
};

const ROOTS = {
	AUTH: 'auth',
	DASHBOARD: 'dashboard',

	// for endpoints
	UPLOAD: 'upload',
} as const; /* satisfies Record<string, `/${string}`> */

export const FRONT_PATH_NAMES = {
	home: '/',
	posts: {
		root: `/${RESOURCE.posts}`,
		page: (pageNum: number) => {
			return makePath(`/${RESOURCE.posts}`, 'page', String(pageNum));
		},
		details: (postSlug: string) => {
			return makePath(`/${RESOURCE.posts}`, postSlug);
		},
		preview: (postId: string) => {
			return makePath(`/${RESOURCE.posts}`, 'preview', postId);
		},
	},
	support: '/support',
} as const;

export const BO_PATH_NAMES = {
	auth: {
		root: makePath(ROOTS.AUTH),
		login: makePath(ROOTS.AUTH, 'login'),
		register: makePath(ROOTS.AUTH, 'register'),
	},
	dashboard: {
		root: makePath(ROOTS.DASHBOARD),
		posts: {
			root: makePath(ROOTS.DASHBOARD, RESOURCE.posts),
			create: makePath(ROOTS.DASHBOARD, RESOURCE.posts, 'new'),
			edit: (postId?: string) => {
				return makePath(ROOTS.DASHBOARD, RESOURCE.posts, 'edit', postId || '');
			},
			details: (postId: string) => {
				return makePath(ROOTS.DASHBOARD, RESOURCE.posts, postId);
			},
		},
		fileManager: {
			root: makePath(ROOTS.DASHBOARD, RESOURCE.fileManager),
		},
	},
} as const;

export const functionName = {
	// users
	getUserAuthData: 'getUserAuthData',
	//
	getAITools: 'getAITools',
	createAITool: 'createAITool',
	// Web hosts
	saveWebHost: 'saveWebHost',
	findWebHost: 'findWebHost',
	// Files
	findAppFile: 'findAppFile',
	createAppFileFolder: 'createAppFileFolder',
	// Posts
	createPost: 'createPost',
	updatePost: 'updatePost',
	// getPost: 'getPost',
	getPostFrontDetails: 'getPostFrontDetails',
	getPostFrontDetailsRelatedPosts: 'getPostFrontDetailsRelatedPosts',
	// ==
	getPostBoEdit: 'getPostBoEdit',
	// findPost: 'findPost',
	findPostFrontList: 'findPostFrontList',
	findPostBoTable: 'findPostBoTable',
	findPostTag: 'findPostTag',
	findPostFrontDetailsRelatedPosts: 'findPostFrontDetailsRelatedPosts',
	// savePost: 'savePost',
} as const;

export const endPoint = {
	// uploadSingleFile: '/upload-single-file',
	// uploadManyFiles: '/upload-many-files',
	// passwordLogin: '/password-login',
	facebookMessengerBotWebHook: '/facebook-messenger-bot-webhook',
	// =======
	parse: (parsePath: string) => {
		return {
			root: parsePath,
			functions: makePath(parsePath, 'functions'),
		} as const;
	},
	// =======
	api: (apiPath: string) => {
		return {
			root: apiPath,
			auth: {
				// root: makePath(apiPath, ROOTS.AUTH),
				passwordLogin: makePath(apiPath, ROOTS.AUTH, 'password-login'),
			},
			upload: {
				single: makePath(apiPath, ROOTS.UPLOAD, 'single'),
				many: makePath(apiPath, ROOTS.UPLOAD, 'many'),
			},
		} as const;
	},
	// auth: {
	// 	root: ROOTS.AUTH,
	// 	facebook: makePath(ROOTS.AUTH, 'facebook'),
	// },
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
	LOCAL_DISK: 'localDisk',
	CLOUDINARY: 'cloudinary',
} as const;

export const PARSE_SESSION_TOKEN_HEADER_KEY = 'X-Parse-Session-Token';
export const PARSE_INSTALLATION_ID_HEADER_KEY = 'X-Parse-InstallationId';
export const PARSE_APPLICATION_ID_HEADER_KEY = 'X-Parse-Application-Id';
export const DEVIST_REST_API_HEADER_KEY = 'X-Devist-Key';

export const SESSION_TOKEN_LOCAL_STORAGE_KEY = 'sessionToken';

export const SLUG_REGEX = /^[a-z0-9-]+$/;
