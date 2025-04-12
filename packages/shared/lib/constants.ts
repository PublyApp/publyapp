import _ from 'lodash';

import type { IRole } from '../types/db/role.types';
import { makePath, toPascalCase } from '../utils/string.utils';

export type IRoleConfig = Pick<IRole, 'code' | 'name' | 'rank'>;

export const userGroup = {
	ANY: 'any',
	TENANT: 'tenant',
	STAFF: 'staff',
} as const;

export const roleEnum = {
	// cspell:ignore fnhux Rwmgyh Jhpma
	STAFF_ADMIN: {
		name: 'STAFF_ADMIN',
		code: 'eM3RYjw2yaQ6Gb4BTfnhux',
		rank: 100,
	} as const,
	STAFF_EDITOR: {
		name: 'STAFF_EDITOR',
		code: 'r6LN7A3RwmgyhZUB4tv8Mn',
		rank: 80,
	} as const,
	STAFF_USER: {
		name: 'STAFF_USER',
		code: 'xPK6yNWkCA5TgGU49p72J3',
		rank: 70,
	} as const,
	STAFF_CONTRIBUTOR: {
		name: 'STAFF_CONTRIBUTOR',
		code: 'WqgTy4uxJhpmaFPzZUNjXk',
		rank: 60,
	} as const,
	// =======================================================
	// ! Role hierarchy by tenants will be hard to implement if using built-in Parse Roles
	// ! because on user may have different Roles in two or more Tenants
	// ! It's Better to implement our own Permission checker for the tenants
	// TENANT_ADMIN: { name: 'TENANT_ADMIN', code: 5_394_846 } as const,
	// TENANT_EDITOR: { name: 'TENANT_EDITOR', code: 4_141_341 } as const,
	TENANT_USER: {
		name: 'TENANT_USER',
		code: 't2GwKsZxen3YyLB7QTup4r',
		rank: 50,
	} as const,
	// TENANT_CONTRIBUTOR: { name: 'TENANT_CONTRIBUTOR', code: 2_347_347 } as const,
	// =======================================================
	AUTHED_USER: {
		name: 'AUTHED_USER',
		code: 'wC5zNLaK6MQjnSe4cGTr3v',
		rank: 40,
	} as const,
} satisfies Record<string, IRoleConfig>;

const STAFF_ADMIN_ONLY = [roleEnum.STAFF_ADMIN] as const;
const ABOVE_STAFF_EDITOR = [
	STAFF_ADMIN_ONLY[0],
	roleEnum.STAFF_EDITOR,
] as const;
const ABOVE_STAFF_USER = [
	ABOVE_STAFF_EDITOR[0],
	ABOVE_STAFF_EDITOR[1],
	roleEnum.STAFF_USER,
] as const;
const ABOVE_STAFF_CONTRIBUTOR = [
	ABOVE_STAFF_USER[0],
	ABOVE_STAFF_USER[1],
	ABOVE_STAFF_USER[2],
	roleEnum.STAFF_CONTRIBUTOR,
] as const;
const ABOVE_TENANT_USER = [
	ABOVE_STAFF_CONTRIBUTOR[0],
	ABOVE_STAFF_CONTRIBUTOR[1],
	ABOVE_STAFF_CONTRIBUTOR[2],
	ABOVE_STAFF_CONTRIBUTOR[3],
	roleEnum.TENANT_USER,
] as const;
const ALL = [
	ABOVE_TENANT_USER[0],
	ABOVE_TENANT_USER[1],
	ABOVE_TENANT_USER[2],
	ABOVE_TENANT_USER[3],
	ABOVE_TENANT_USER[4],
	roleEnum.AUTHED_USER,
] as const;

export const roleSet = {
	STAFF_ADMIN_ONLY,
	ABOVE_STAFF_EDITOR,
	ABOVE_STAFF_USER,
	ABOVE_STAFF_CONTRIBUTOR,
	// ===
	ABOVE_TENANT_USER,
	ALL,
	// ===
	STAFF_MEMBER: ABOVE_STAFF_CONTRIBUTOR,
	TENANT_MEMBER: [roleEnum.TENANT_USER],
};

export type RoleSet = ValueOf<typeof roleSet>;

export const staffRoleSet = _.pick(roleSet, [
	'STAFF_ADMIN_ONLY',
	'ABOVE_STAFF_EDITOR',
	'ABOVE_STAFF_USER',
	'ABOVE_STAFF_CONTRIBUTOR',
	'STAFF_MEMBER',
]);

export type StaffRoleSet = ValueOf<typeof staffRoleSet>;

export const tenantSubRoleEnum = {
	ADMIN: 'ADMIN',
	EDITOR: 'EDITOR',
	USER: 'USER',
	CONTRIBUTOR: 'CONTRIBUTOR',
} as const;

export type TenantSubRole = ValueOf<typeof tenantSubRoleEnum>;

export const tenantSubRoleRank = {
	[tenantSubRoleEnum.ADMIN]: 100,
	[tenantSubRoleEnum.EDITOR]: 80,
	[tenantSubRoleEnum.USER]: 70,
	[tenantSubRoleEnum.CONTRIBUTOR]: 60,
};

export const tenantSubRoleSet = {
	ADMIN_ONLY: [tenantSubRoleEnum.ADMIN] as const,
	ABOVE_EDITOR: [tenantSubRoleEnum.ADMIN, tenantSubRoleEnum.EDITOR] as const,
	ABOVE_USER: [
		tenantSubRoleEnum.ADMIN,
		tenantSubRoleEnum.EDITOR,
		tenantSubRoleEnum.USER,
	] as const,
	ALL: [
		tenantSubRoleEnum.ADMIN,
		tenantSubRoleEnum.EDITOR,
		tenantSubRoleEnum.USER,
		tenantSubRoleEnum.CONTRIBUTOR,
	] as const,
};

export type TenantSubRoleSet = ValueOf<typeof tenantSubRoleSet>;

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
	// USER_PROFILE: 'UserProfile',
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
): `_CustomJoin:${C1}:${C2}` => {
	return `_CustomJoin:${classNameA}:${classNameB}`;
};

const createParseJoinClassName = <F extends string, C extends string>(
	relationFieldName: F,
	parentClassName: C,
): `_Join:${F}:${C}` => {
	return `_Join:${relationFieldName}:${parentClassName}`;
};

const joinsClassName = {
	_CUSTOM_JOIN_USER_TO_TENANT: createCustomJoinClassName(
		basicClassName.USER,
		basicClassName.TENANT,
	),
	_JOIN_USER_TO_ROLE: createParseJoinClassName(
		'users' as const,
		basicClassName.ROLE,
	),
};

export const className = {
	...basicClassName,
	...joinsClassName,
} as const;

export const APP_ID = 'pdf_vite_app';
export const APP_NAME = 'PDF Vite';
// eslint-disable-next-line @typescript-eslint/naming-convention
export const APP_NAME_PASCAl_CASE = toPascalCase(APP_NAME);

export const LOCALE_HEADER_KEY = `X-${APP_NAME_PASCAl_CASE}-Locale`;
export const TENANT_ID_HEADER_KEY = `X-${APP_NAME_PASCAl_CASE}-TenantId`;
export const X_FORWARDED_FOR_HEADER_KEY = 'X-Forwarded-For';
export const X_REMIX_CLIENT_IP = 'X-Remix-Client-IP';

const RESOURCE = {
	users: 'users',
	client: 'client',
	clients: 'clients',
	tenant: 'tenant',
	tenants: 'tenants',
	posts: 'posts',
	fileManager: 'file-manager',
	blog: 'blog',
	shortUrl: 'short-url',
} as const;

const ROOTS = {
	AUTH: 'auth',
	DASHBOARD: 'dashboard',
	STAFF: 'staff',
	UPLOAD: 'upload',
} as const;

export const FRONT_PATH_NAMES = {
	home: '/',
	auth: {
		login: makePath('login'),
		signup: makePath('sign-up'),
	},
	tenant: (tenantId: string = '') => {
		return {
			root: makePath(RESOURCE.client, tenantId),
		};
	},
	staff: {
		root: makePath(ROOTS.STAFF),
		tenants: {
			root: makePath(ROOTS.STAFF, RESOURCE.tenants),
			details: (tenantId: string = '') => {
				return makePath(ROOTS.STAFF, RESOURCE.tenants, tenantId);
			},
		},
		tenantUsers: {
			root: makePath(ROOTS.STAFF, 'tenant-users'),
			details: (userId: string = '') => {
				return makePath(ROOTS.STAFF, 'tenant-users', userId);
			},
		},
		staffMembers: {
			root: makePath(ROOTS.STAFF, 'staff-members'),
			details: (userId: string = '') => {
				return makePath(ROOTS.STAFF, 'staff-members', userId);
			},
		},
	},
} as const;

export const functionName = {
	// Users and auth
	auth: {
		getUserAuthData: 'getUserAuthData',
		getTenantAuthData: 'getTenantAuthData',
		getIsDisabledSignup: 'getIsDisabledSignup',
		getRedirectCode: 'getRedirectCode',
		// ===
		removeSeededUsers: 'removeSeededUsers',
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
		findBlogPostFrontDetailsRelatedPosts:
			'findBlogPostFrontDetailsRelatedPosts',
		findBlogPostSlug: 'findBlogPostSlug',
		addSlugToBlogPost: 'addSlugToBlogPost',
		removeSeededBlogPosts: 'removeSeededBlogPosts',
		setBlogPostCurrentSlug: 'setBlogPostCurrentSlug',
		// updateBlogPostAuthorPointers: 'updateBlogPostAuthorPointers',
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

const API_ROOT = 'api';
const PARSE_ROOT = 'parse';

export const endPoint = {
	api: {
		root: makePath(API_ROOT),
		auth: {
			// root: makePath(apiPath, ROOTS.AUTH),
			passwordLogin: makePath(API_ROOT, ROOTS.AUTH, 'password-login'),
			passwordSignup: makePath(API_ROOT, ROOTS.AUTH, 'password-signup'),
			verifyEmail: makePath(API_ROOT, ROOTS.AUTH, 'verify-email'),
		},
		upload: {
			single: makePath(API_ROOT, ROOTS.UPLOAD, 'single'),
			many: makePath(API_ROOT, ROOTS.UPLOAD, 'many'),
		},
		parse: {
			root: makePath(API_ROOT, PARSE_ROOT),
			functions: makePath(API_ROOT, PARSE_ROOT, 'functions'),
		},
	},
} as const;

export const DEFAULT_PAGE_SIZE = 25;

export const isServer = typeof window === 'undefined';

export const fileProvider = {
	LOCAL_DISK: 'localDisk',
	CLOUDINARY: 'cloudinary',
} as const;

export const PARSE_SESSION_TOKEN_HEADER_KEY = 'X-Parse-Session-Token';
export const PARSE_INSTALLATION_ID_HEADER_KEY = 'X-Parse-InstallationId';
export const PARSE_APPLICATION_ID_HEADER_KEY = 'X-Parse-Application-Id';
export const REST_API_HEADER_KEY = `X-${APP_NAME_PASCAl_CASE}-Key`;

export const SESSION_TOKEN_COOKIE_KEY = `${APP_ID}:session_token`;
export const LAST_USED_TENANT_ID_COOKIE_KEY = `${APP_ID}:last_used_tenant`;

export const SLUG_REGEX = /^[a-z0-9-]+$/;

export const queryParamKey = {
	language: 'lng',
};

export const jobType = {
	CONVERT_HTML_TO_PDF: 'CONVERT_HTML_TO_PDF',
	// Later we may add other jobs, like deleting unused pdf from storage and from DB for example
} as const;
