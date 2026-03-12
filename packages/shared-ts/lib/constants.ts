import { makePath, toPascalCase } from '../utils/string.utils';
import type { NameSpace } from './i18n/resources';

export const APP_ID = 'publyapp';
export const APP_NAME = 'PublyApp';

export const APP_NAME_PASCAl_CASE = toPascalCase(APP_NAME);

export const SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';
export const SESSION_TOKEN_COOKIE_KEY = `${APP_ID}-session_token`;
/** @deprecated Use TENANT_HINTS_COOKIE_KEY_LEGACY for new code */
export const LAST_USED_TENANT_ID_COOKIE_KEY = `${APP_ID}-last_used_tenant`;
export const LOCALE_COOKIE_KEY = `${APP_ID}-locale`; // used to help remix detect language server-side

// =============================================================================
// Tenant Hints Cookie (Identity-Scoped)
// See: docs/implementation-plans/identity-scoped-tenant-cookie.md
// =============================================================================

/** New cookie key for user→tenant mapping (v4 format) */
export const TENANT_HINTS_COOKIE_KEY = `${APP_ID}-last_tenants`;

/** Legacy cookie key (v1-v3, for migration) */
export const TENANT_HINTS_COOKIE_KEY_LEGACY = LAST_USED_TENANT_ID_COOKIE_KEY;

/** Max users to store in mapping (keeps cookie under 1KB) */
export const TENANT_HINTS_MAX_ENTRIES = 10;

/** Cookie version for future format changes */
export const TENANT_HINTS_COOKIE_VERSION = 'v1';

/** Max cookie value length before treating as invalid (DoS protection) */
export const TENANT_HINTS_MAX_COOKIE_LENGTH = 2048;

/** Paths to clear legacy cookie from (handles historical path-scoped duplicates) */
export const TENANT_HINTS_LEGACY_CLEAR_PATHS = [
	'/',
	'/auth',
	'/auth/login',
	'/app',
] as const;

export const LOCALE_HEADER_KEY = `X-${APP_NAME_PASCAl_CASE}-Locale`;
export const TENANT_ID_HEADER_KEY = `X-${APP_NAME_PASCAl_CASE}-TenantId`;
export const FORWARDED_FOR_HEADER_KEY = 'X-Forwarded-For';
export const REMIX_CLIENT_IP_HEADER_KEY = 'X-Remix-Client-IP';
export const CLOUDFLARE_CONNECTING_IP_HEADER_KEY = 'CF-Connecting-IP';

// =============================================================================
// Redirect Codes (GetRedirectCode API response)
// =============================================================================

export const REDIRECT_CODE = {
	STAFF: 'staff',
	UNAUTHORIZED: 'unauthorized',
	TENANT_PICKER: 'tenant-picker',
} as const;

export type RedirectCode =
	| (typeof REDIRECT_CODE)[keyof typeof REDIRECT_CODE]
	| (string & {});

const RESOURCE = {
	users: 'users',
	app: 'app',
	client: 'client',
	clients: 'clients',
	tenant: 'tenant',
	tenants: 'tenants',
	posts: 'posts',
	fileManager: 'file-manager',
	blog: 'blog',
	shortUrl: 'short-url',
	tenantUsers: 'tenant-users',
	staffUsers: 'staff-users',
	profiles: 'profiles',
	invitations: 'invitations',
	auditLogs: 'audit-logs',
} as const;

const ROOTS = {
	AUTH: 'auth',
	DASHBOARD: 'dashboard',
	STAFF: 'staff',
	UPLOAD: 'upload',
	ONBOARDING: 'onboarding',
} as const;

export const FRONT_PATH_NAMES = {
	home: '/',
	unauthorized: makePath('unauthorized'),
	auth: {
		login: makePath('login'),
		signup: makePath('sign-up'),
		verifyEmail: makePath('verify-email'),
		resetPassword: makePath('reset-password'),
		acceptInvitation: makePath('accept-invitation'),
		clearSession: makePath(ROOTS.AUTH, 'clear-session'),
	},
	tenant: (tenantId = '') => {
		return {
			_root: makePath(RESOURCE.app),
			organizations: makePath(RESOURCE.app, 'organizations'),
			root: makePath(RESOURCE.app, tenantId),
			posts: {
				root: makePath(RESOURCE.app, tenantId, 'posts'),
				drafts: makePath(RESOURCE.app, tenantId, 'posts', 'drafts'),
				history: makePath(RESOURCE.app, tenantId, 'posts', 'history'),
			},
			settings: {
				root: makePath(RESOURCE.app, tenantId, 'settings'),
				general: makePath(RESOURCE.app, tenantId, 'settings', 'general'),
				members: makePath(RESOURCE.app, tenantId, 'settings', 'members'),
				roles: makePath(RESOURCE.app, tenantId, 'settings', 'roles'),
				workspaces: makePath(RESOURCE.app, tenantId, 'settings', 'workspaces'),
				integrations: makePath(
					RESOURCE.app,
					tenantId,
					'settings',
					'integrations',
				),
				billing: makePath(RESOURCE.app, tenantId, 'settings', 'billing'),
				security: makePath(RESOURCE.app, tenantId, 'settings', 'security'),
			},
			account: {
				root: makePath(RESOURCE.app, tenantId, 'account'),
				security: makePath(RESOURCE.app, tenantId, 'account', 'security'),
				notifications: makePath(
					RESOURCE.app,
					tenantId,
					'account',
					'notifications',
				),
			},
		};
	},
	staff: {
		root: makePath(ROOTS.STAFF),
		account: {
			root: makePath(ROOTS.STAFF, 'account'),
			security: makePath(ROOTS.STAFF, 'account', 'security'),
			notifications: makePath(ROOTS.STAFF, 'account', 'notifications'),
		},
		profiles: {
			root: makePath(ROOTS.STAFF, RESOURCE.profiles),
			new: makePath(ROOTS.STAFF, RESOURCE.profiles, 'new'),
			details: (profileId = '') => {
				return {
					root: makePath(ROOTS.STAFF, RESOURCE.profiles, 'details', profileId),
					tabs: {
						basicsAndPermissions: makePath(
							ROOTS.STAFF,
							RESOURCE.profiles,
							'details',
							profileId,
						),
						users: makePath(
							ROOTS.STAFF,
							RESOURCE.profiles,
							'details',
							profileId,
							'users',
						),
					},
				};
			},
		},
		tenants: {
			root: makePath(ROOTS.STAFF, RESOURCE.tenants),
			new: makePath(ROOTS.STAFF, RESOURCE.tenants, 'new'),
			details: (tenantId = '') => {
				return {
					root: makePath(ROOTS.STAFF, RESOURCE.tenants, 'details', tenantId),
					tabs: {
						general: makePath(
							ROOTS.STAFF,
							RESOURCE.tenants,
							'details',
							tenantId,
						),
						users: makePath(
							ROOTS.STAFF,
							RESOURCE.tenants,
							'details',
							tenantId,
							'users',
						),
						billing: makePath(
							ROOTS.STAFF,
							RESOURCE.tenants,
							'details',
							tenantId,
							'billing',
						),
						profiles: makePath(
							ROOTS.STAFF,
							RESOURCE.tenants,
							'details',
							tenantId,
							'profiles',
						),
					},
				};
			},
		},
		tenantUsers: {
			root: makePath(ROOTS.STAFF, RESOURCE.tenantUsers),
			new: makePath(ROOTS.STAFF, RESOURCE.tenantUsers, 'new'),
			details: (userId = '') => {
				return makePath(ROOTS.STAFF, RESOURCE.tenantUsers, 'details', userId);
			},
		},
		staffUsers: {
			root: makePath(ROOTS.STAFF, RESOURCE.staffUsers),
			new: makePath(ROOTS.STAFF, RESOURCE.staffUsers, 'new'),
			details: (userId = '') => {
				return makePath(ROOTS.STAFF, RESOURCE.staffUsers, 'details', userId);
			},
		},
		invitations: {
			root: makePath(ROOTS.STAFF, RESOURCE.invitations),
			new: makePath(ROOTS.STAFF, RESOURCE.invitations, 'new'),
			details: (invitationId = '') => {
				return makePath(
					ROOTS.STAFF,
					RESOURCE.invitations,
					'details',
					invitationId,
				);
			},
		},
		auditLogs: {
			root: makePath(ROOTS.STAFF, RESOURCE.auditLogs),
			details: (logId = '') => {
				return makePath(ROOTS.STAFF, RESOURCE.auditLogs, 'details', logId);
			},
		},
		backgroundJobs: {
			root: makePath(ROOTS.STAFF, 'background-jobs'),
		},
	},
} as const;

export const DEFAULT_PAGE_SIZE = 100;

export const isServer = typeof window === 'undefined';

export const isBun = typeof Bun !== 'undefined';

export const SLUG_REGEX = /^[a-z0-9-]+$/;

export const queryParamKey = {
	language: 'lng',
	token: 'token',
	notice: 'notice',
	login_page: {
		redirect_cause: 'rc',
		redirect_to: 'rto',
	},
	reset_password_page: {
		redirect_cause: 'rc',
		encoded_email: 'id',
		token: 'token',
	},
	accept_invitation_page: {
		encoded_email: 'id',
		token: 'token',
	},
} as const;

/**
 * Form action keys for POST-based operations.
 * Using POST instead of GET query params prevents CSRF attacks.
 */
export const formActionKey = {
	/**
	 * Action to clear httpOnly session cookies.
	 * Used when client-side JS detects it cannot read a cookie that the server can see.
	 */
	clear_httponly_session: 'clear_httponly_session',
} as const;

export const queryParamValue = {
	notice: {
		org_suspended: 'org-suspended',
	},
	login_page: {
		redirect_cause: {
			invalid_session: 'invalid_session',
			password_reset_success: 'password_reset_success',
		},
	},
	reset_password_page: {
		redirect_cause: {
			email_verification: 'email_verification',
		},
	},
} as const;

export const jobType = {
	EXAMPLE_JOB: 'EXAMPLE_JOB',
	// Later we may add other jobs, like deleting unused pdf from storage and from DB for example
} as const;

export const DEFAULT_MAX_USER_PER_TENANT = 5;

export const PRE_RENDER_PATHS = ['/', '/login'] as const;

export type PreRenderPath = (typeof PRE_RENDER_PATHS)[number];

export const isPreRenderPath = (path: string): path is PreRenderPath => {
	let _path = path;
	if (path !== '/' && _path.endsWith('/')) {
		_path = _path.slice(0, -1);
	}
	return PRE_RENDER_PATHS.includes(_path as PreRenderPath);
};

export const STATIC_PRE_RENDER_PATHS_MAP_NONCE =
	'Ynuh4K7aYVf6z5RVxEGnal9zru8ZmYZsSE3n2GNtbBbc6Z2VRq';

export const TENANT_PROFILES_PERMISSIONS_ENUM = {
	CAN_ACCESS_DASHBOARD: 'can_access_dashboard',
	CAN_ACCESS_BILLING: 'can_access_billing',
	CAN_ACCESS_SETTINGS: 'can_access_settings',
	CAN_ACCESS_USERS: 'can_access_users',
} as const;

export const TENANT_MODULES_ENUM = {
	ALL: 'all',
} as const;

export const TENANT_MODULES_GROUPING = {
	// Group in a single module for now.
	// When we have more modules, we can split them into different modules.
	ALL: {
		code: 'all',
		permissions: [
			TENANT_PROFILES_PERMISSIONS_ENUM.CAN_ACCESS_DASHBOARD,
			TENANT_PROFILES_PERMISSIONS_ENUM.CAN_ACCESS_BILLING,
			TENANT_PROFILES_PERMISSIONS_ENUM.CAN_ACCESS_SETTINGS,
			TENANT_PROFILES_PERMISSIONS_ENUM.CAN_ACCESS_USERS,
		],
	},
} as const;

export type TenantModulesEnum = ValueOf<typeof TENANT_MODULES_ENUM>;

export type TenantProfilesPermissionsEnum = ValueOf<
	typeof TENANT_PROFILES_PERMISSIONS_ENUM
>;

export const LANGUAGE_DETECTION_METHOD_ENUM = {
	COOKIE: 'cookie',
	QUERY_PARAM: 'queryParam',
} as const;

export type LanguageDetectionMethod = ValueOf<
	typeof LANGUAGE_DETECTION_METHOD_ENUM
>;

export const LANGUAGE_DETECTION_METHOD: LanguageDetectionMethod =
	LANGUAGE_DETECTION_METHOD_ENUM.COOKIE;

export const ACCOUNT_LEVEL_ENUM = {
	ADMIN: 'Admin',
	USER: 'User',
} as const;

export type AccountLevel = ValueOf<typeof ACCOUNT_LEVEL_ENUM>;

export const USER_STATUS_ENUM = {
	INACTIVE: 'Inactive',
	PENDING: 'Pending',
	SUSPENDED: 'Suspended',
	ACTIVE: 'Active',
	DELETED: 'Deleted',
	BANNED: 'Banned',
} as const;

export type UserStatus = ValueOf<typeof USER_STATUS_ENUM>;

export const TENANT_STATUS_ENUM = {
	PENDING: 'Pending',
	ACTIVE: 'Active',
	SUSPENDED: 'Suspended',
	ARCHIVED: 'Archived',
} as const;

export type TenantStatus = ValueOf<typeof TENANT_STATUS_ENUM>;

export const voidFunction = () => {};

export const I18N_NAMESPACES = {
	COMMON: 'common',
	ZOD: 'zod',
	RESPONSE_MESSAGE: 'response-message',
} as const satisfies Record<string, NameSpace>;

export const MAX_PROFILES_PER_ACCOUNT = 5;
