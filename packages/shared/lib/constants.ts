import { makePath, toPascalCase } from '../utils/string.utils';

export const APP_ID = 'publyapp';
export const APP_NAME = 'PublyApp';

export const APP_NAME_PASCAl_CASE = toPascalCase(APP_NAME);

export const LOCALE_HEADER_KEY = `X-${APP_NAME_PASCAl_CASE}-Locale`;
export const TENANT_ID_HEADER_KEY = `X-${APP_NAME_PASCAl_CASE}-TenantId`;
export const FORWARDED_FOR_HEADER_KEY = 'X-Forwarded-For';
export const REMIX_CLIENT_IP_HEADER_KEY = 'X-Remix-Client-IP';
export const CLOUDFLARE_CONNECTING_IP_HEADER_KEY = 'CF-Connecting-IP';

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
	staffMembers: 'staff-members',
	tenantUSers: 'tenant-users',
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
		verifyEmail: makePath('verify-email'),
		resetPassword: makePath('reset-password'),
	},
	tenant: (tenantId = '') => {
		return {
			root: makePath(RESOURCE.client, tenantId),
		};
	},
	staff: {
		root: makePath(ROOTS.STAFF),
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
		users: {
			root: makePath(ROOTS.STAFF, RESOURCE.users),
			details: (userId = '') => {
				return makePath(ROOTS.STAFF, RESOURCE.users, 'details', userId);
			},
		},
		tenantUsers: {
			root: makePath(ROOTS.STAFF, RESOURCE.tenantUSers),
			new: makePath(ROOTS.STAFF, RESOURCE.tenantUSers, 'new'),
			details: (userId = '') => {
				return makePath(ROOTS.STAFF, RESOURCE.tenantUSers, 'details', userId);
			},
		},
		staffMembers: {
			root: makePath(ROOTS.STAFF, RESOURCE.staffMembers),
			new: makePath(ROOTS.STAFF, RESOURCE.staffMembers, 'new'),
			details: (userId = '') => {
				return makePath(ROOTS.STAFF, RESOURCE.staffMembers, 'details', userId);
			},
		},
		settings: {
			root: makePath(ROOTS.STAFF, 'settings'),
		},
	},
} as const;

export const DEFAULT_PAGE_SIZE = 100;

export const isServer = typeof window === 'undefined';

export const isBun = typeof Bun !== 'undefined';

export const SESSION_TOKEN_HEADER_KEY = 'X-Session-Token';

export const SESSION_TOKEN_COOKIE_KEY = `${APP_ID}-session_token`;
export const LAST_USED_TENANT_ID_COOKIE_KEY = `${APP_ID}-last_used_tenant`;
export const LOCALE_COOKIE_KEY = `${APP_ID}-locale`; // used to help remix detect language server-side

export const SLUG_REGEX = /^[a-z0-9-]+$/;

export const queryParamKey = {
	language: 'lng',
	token: 'token',
	login_page: {
		redirect_cause: 'rc',
	},
	reset_password_page: {
		redirect_cause: 'rc',
		encoded_email: 'id',
		token: 'token',
	},
} as const;

export const queryParamValue = {
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
	ADMIN: 50,
	USER: 10,
} as const;

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
