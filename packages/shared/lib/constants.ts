import _ from 'lodash';

import { imageFormatTypes } from '@/shared/types/db/appFile.types';

import type { IRole } from '../types/db/role.types';

import type { AppLocale } from './i18n/resources';

export type IRoleConfig = Pick<IRole, 'code' | 'name'>;

export const roleEnum = {
	STAFF_ADMIN: { name: 'STAFF_ADMIN', code: 9_124_562 } as const,
	STAFF_EDITOR: { name: 'STAFF_EDITOR', code: 8_958_027 } as const,
	STAFF_USER: { name: 'STAFF_USER', code: 7_445_635 } as const,
	STAFF_CONTRIBUTOR: { name: 'STAFF_CONTRIBUTOR', code: 6_945_523 } as const,
	// =======================================================
	TENANT_ADMIN: { name: 'TENANT_ADMIN', code: 5_394_846 } as const,
	TENANT_EDITOR: { name: 'TENANT_EDITOR', code: 4_141_341 } as const,
	TENANT_USER: { name: 'TENANT_USER', code: 3_545_384 } as const,
	TENANT_CONTRIBUTOR: { name: 'TENANT_CONTRIBUTOR', code: 2_347_347 } as const,
	// =======================================================
	AUTHED_USER: { name: 'AUTHED_USER', code: 1_374_445 } as const,
} satisfies Record<string, IRoleConfig>;

const STAFF_ADMIN_ONLY = [roleEnum.STAFF_ADMIN] as const;
const ABOVE_STAFF_EDITOR = [STAFF_ADMIN_ONLY[0], roleEnum.STAFF_EDITOR] as const;
const ABOVE_STAFF_USER = [ABOVE_STAFF_EDITOR[0], ABOVE_STAFF_EDITOR[1], roleEnum.STAFF_USER] as const;
const ABOVE_STAFF_CONTRIBUTOR = [
	ABOVE_STAFF_USER[0],
	ABOVE_STAFF_USER[1],
	ABOVE_STAFF_USER[2],
	roleEnum.STAFF_CONTRIBUTOR,
] as const;
const ABOVE_TENANT_ADMIN = [
	ABOVE_STAFF_CONTRIBUTOR[0],
	ABOVE_STAFF_CONTRIBUTOR[1],
	ABOVE_STAFF_CONTRIBUTOR[2],
	ABOVE_STAFF_CONTRIBUTOR[3],
	roleEnum.TENANT_ADMIN,
] as const;
const ABOVE_TENANT_EDITOR = [
	ABOVE_TENANT_ADMIN[0],
	ABOVE_TENANT_ADMIN[1],
	ABOVE_TENANT_ADMIN[2],
	ABOVE_TENANT_ADMIN[3],
	ABOVE_TENANT_ADMIN[4],
	roleEnum.TENANT_EDITOR,
] as const;
const ABOVE_TENANT_USER = [
	ABOVE_TENANT_EDITOR[0],
	ABOVE_TENANT_EDITOR[1],
	ABOVE_TENANT_EDITOR[2],
	ABOVE_TENANT_EDITOR[3],
	ABOVE_TENANT_EDITOR[4],
	ABOVE_TENANT_EDITOR[5],
	roleEnum.TENANT_USER,
] as const;
const ABOVE_TENANT_CONTRIBUTOR = [
	ABOVE_TENANT_USER[0],
	ABOVE_TENANT_USER[1],
	ABOVE_TENANT_USER[2],
	ABOVE_TENANT_USER[3],
	ABOVE_TENANT_USER[4],
	ABOVE_TENANT_USER[5],
	ABOVE_TENANT_USER[6],
	roleEnum.TENANT_CONTRIBUTOR,
] as const;
const ALL = [
	ABOVE_TENANT_CONTRIBUTOR[7],
	ABOVE_TENANT_CONTRIBUTOR[0],
	ABOVE_TENANT_CONTRIBUTOR[1],
	ABOVE_TENANT_CONTRIBUTOR[2],
	ABOVE_TENANT_CONTRIBUTOR[3],
	ABOVE_TENANT_CONTRIBUTOR[4],
	ABOVE_TENANT_CONTRIBUTOR[5],
	ABOVE_TENANT_CONTRIBUTOR[6],
	ABOVE_TENANT_CONTRIBUTOR[7],
	roleEnum.AUTHED_USER,
] as const;

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
};

export type RoleSet = (typeof roleSet)[keyof typeof roleSet];

/**
 * Parse Server class names (collection names)
 */
const basicClassName = {
	USER: '_User',
	ROLE: '_Role',
	SESSION: '_Session',
	SCHEMA: '_SCHEMA',
	JOB_STATUS: '_JobStatus',
	// =====================
	USER_PROFILE: 'UserProfile',
	// === Multi Tenancy ===
	TENANT: 'Tenant',
	TENANT_MODULE: 'TenantModule',
	// === Custom classes ===
	BLOG_POST: 'BlogPost',
	BLOG_POST_SLUG: 'BlogPostSlug',
	BLOG_POST_TAG: 'BlogPostTag',
	BLOG_POST_SERIES: 'BlogPostSeries',
	// ==============
	// ==============
	APP_FILE: 'AppFile',
	SHORT_URL: 'ShortUrl',
	// ==== not used anymore
} as const;

const createCustomJoinClassName = <C1 extends string, C2 extends string>(
	classNameA: C1,
	classNameB: C2,
): `$Join:${C1}:${C2}` => {
	return `$Join:${classNameA}:${classNameB}`;
};

const createParseJoinClassName = <F extends string, C extends string>(
	relationFieldName: F,
	parentClassName: C,
): `_Join:${F}:${C}` => {
	return `_Join:${relationFieldName}:${parentClassName}`;
};

const joinsClassName = {
	$JOIN_USER_TO_TENANT: createCustomJoinClassName(basicClassName.USER, basicClassName.TENANT),
	JOIN_USER_TO_ROLE: createParseJoinClassName('users' as const, basicClassName.ROLE),
};

export const className = {
	...basicClassName,
	...joinsClassName,
} as const;

export const LOCALE_HEADER_KEY = 'X-Devist-Locale';
export const TENANT_ID_HEADER_KEY = 'X-Devist-TenantId';

const RESOURCE = {
	posts: 'posts',
	fileManager: 'file-manager',
	blog: 'blog',
	tenant: 'tenant',
	tenants: 'tenants',
	shortUrl: 'short-url',
} as const;

const ROOTS = {
	AUTH: 'auth',
	DASHBOARD: 'dashboard',
	STAFF: 'staff',
	UPLOAD: 'upload',
} as const;

const makePath = (...params: string[]) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _params: string[] = [];

	params?.forEach((param /* , index */) => {
		if (param?.length <= 0 || param === '/') {
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

export const FRONT_PATH_NAMES = {
	home: '/',
	posts: {
		root: makePath(RESOURCE.posts),
		page: (pageNum: number) => {
			return makePath(RESOURCE.posts, 'page', String(pageNum));
		},
		details: (postSlug: string, locale?: AppLocale) => {
			return makePath(locale || '', RESOURCE.posts, postSlug);
		},
		preview: (postId: string) => {
			return makePath(RESOURCE.posts, 'preview', postId);
		},
	},
	support: '/support',
} as const;

export const BO_PATH_NAMES = {
	auth: {
		root: makePath(ROOTS.AUTH),
		login: makePath(ROOTS.AUTH, 'login'),
		signup: makePath(ROOTS.AUTH, 'sign-up'),
		verifyEmail: makePath(ROOTS.AUTH, 'verify-email'),
		forgotPassword: makePath(ROOTS.AUTH, 'forgot-password'),
	},
	// ===================
	portal: makePath('portal'),
	// ===================
	staff: {
		root: makePath(ROOTS.STAFF),
		posts: {
			root: makePath(ROOTS.STAFF, RESOURCE.posts),
			create: makePath(ROOTS.STAFF, RESOURCE.posts, 'new'),
			edit: (postId?: string) => {
				return makePath(ROOTS.STAFF, RESOURCE.posts, 'edit', postId || '');
			},
			details: (postId: string) => {
				return makePath(ROOTS.STAFF, RESOURCE.posts, postId);
			},
			settings: makePath(ROOTS.STAFF, RESOURCE.posts, 'settings'),
		},
		tenants: {
			root: makePath(ROOTS.STAFF, RESOURCE.tenants),
			// TODO
		},
	},
	// ===================
	getTenantPaths: (tenantId: string = '') => {
		return {
			root: makePath(RESOURCE.tenant, tenantId),
			chose: makePath(RESOURCE.tenant, 'chose'),
			// dashboard: makePath(RESOURCE.tenant, tenantId, ROOTS.DASHBOARD),
			shortUrl: {
				root: makePath(RESOURCE.tenant, tenantId, RESOURCE.shortUrl),
				// CRUD, etc
			},
		};
	},
} as const;

export const functionName = {
	// Users and auth
	auth: {
		getUserAuthData: 'getUserAuthData',
		removeSeededUsers: 'removeSeededUsers',
		getIsDisabledSignup: 'getIsDisabledSignup',
	},
	// Blog Posts
	blog: {
		createBlogPost: 'createBlogPost',
		updateBlogPost: 'updateBlogPost',
		getBlogPostFrontDetails: 'getBlogPostFrontDetails',
		getBlogPostFrontDetailsRelatedPosts: 'getBlogPostFrontDetailsRelatedPosts',
		getBlogPostBoEdit: 'getBlogPostBoEdit',
		findBlogPostFrontList: 'findBlogPostFrontList',
		findBlogPostBoTable: 'findBlogPostBoTable',
		findBlogPostTag: 'findBlogPostTag',
		findBlogPostFrontDetailsRelatedPosts: 'findBlogPostFrontDetailsRelatedPosts',
		findBlogPostSlug: 'findBlogPostSlug',
		addSlugToBlogPost: 'addSlugToBlogPost',
		removeSeededBlogPosts: 'removeSeededBlogPosts',
		setBlogPostCurrentSlug: 'setBlogPostCurrentSlug',
		updateBlogPostAuthorPointers: 'updateBlogPostAuthorPointers',
	},
	fileManager: {
		// Files
		findAppFile: 'findAppFile',
		createAppFileFolder: 'createAppFileFolder',
	},
} as const;

export const jobName = {
	blog: {
		collectBlogPostTags: 'collectBlogPostTags',
	},
} as const;

export const endPoint = {
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
				passwordSignup: makePath(apiPath, ROOTS.AUTH, 'password-signup'),
				verifyEmail: makePath(apiPath, ROOTS.AUTH, 'verify-email'),
			},
			upload: {
				single: makePath(apiPath, ROOTS.UPLOAD, 'single'),
				many: makePath(apiPath, ROOTS.UPLOAD, 'many'),
			},
		} as const;
	},
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

export const SESSION_TOKEN_LOCAL_STORAGE_KEY = 'session_token';
export const LAST_USED_TENANT_ID_STORAGE_KEY = 'last_used_tenant';

export const SLUG_REGEX = /^[a-z0-9-]+$/;
