import type { RequestHandler } from 'express';
import _ from 'lodash';
import { HttpException } from '@/server/exceptions/HttpException';
import { AuthCloudService } from '@/server/modules/common/auth/auth-cloud.service';
import {
	PARSE_SESSION_TOKEN_HEADER_KEY,
	type RoleSet,
	roleSet,
	type StaffRoleSet,
	TENANT_ID_HEADER_KEY,
	type TenantSubRoleSet,
	tenantSubRoleSet,
	userGroup,
} from '@/shared/lib/constants';
import {
	CONFIG_ENABLE_CHECK_SESSION_IP,
	USE_MASTER_KEY,
} from '../lib/constants';
import { expressHandler, getHeader, getRequestUtils } from '../lib/express';
import RoleService from '../modules/common/auth/role/role.service';
import ParseTenant from '../modules/common/auth/tenant/tenant.class';
import TenantService from '../modules/common/auth/tenant/tenant.service';

export const authType = {
	SESSION_TOKEN: 'sessionToken',
	API_KEY: 'apiKey',
} as const;

export type ProtectionMiddlewareOptions = {
	authType: ValueOf<typeof authType>;
} & ( // * case A: request can be from any authed user
	| {
			group?: typeof userGroup.ANY | undefined;
			allowedRoles?: RoleSet | undefined;
			allowedTenantSubRoles?: undefined;
	  }
	// * case B: request must be from a tenant member
	// * implicitly, that means also: if the user is a staff member allow the middleware to pass
	// * but if the user is a staff member, only allow the middleware to pass if the user has the correct tenant sub roles
	| {
			group: typeof userGroup.TENANT;
			allowedRoles?: undefined;
			allowedTenantSubRoles?: TenantSubRoleSet | undefined;
	  }
	// * case C: request must be from a staff member
	| {
			group: typeof userGroup.STAFF;
			allowedRoles?: StaffRoleSet | undefined;
			allowedTenantSubRoles?: undefined;
	  }
);

/**
 * If no auth is needed for your route, just don't use this middleware in the first place.
 */
const protectionMiddleware = (
	options: ProtectionMiddlewareOptions,
): RequestHandler => {
	if (CONFIG_ENABLE_CHECK_SESSION_IP) {
		// TODO: implement ip address check
		throw new Error(
			'Not implemented: ' +
				'CONFIG_ENABLE_CHECK_SESSION_IP is set to true, change to false or implement ip address check',
		);
	}

	if (options.authType === 'apiKey') {
		throw new Error(
			'Not implemented: ' +
				"options.authType is set to 'apiKey', change to 'sessionToken' or implement api key check",
		);
	}

	if (
		!_.isNil(options.group) &&
		!_.includes(_.values(userGroup), options.group)
	) {
		throw new Error(
			`Invalid group:${options.group} is not a valid group. Valid groups are: ${_.join(_.values(userGroup), ', ')}`,
		);
	}

	const { group = userGroup.ANY } = options;

	return expressHandler(async (req, _res, next) => {
		const { t } = getRequestUtils(req);

		const sessionToken =
			getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY) ||
			_.get(req, 'body._SessionToken');

		if (!sessionToken) {
			return next(new HttpException(401, t('unauthorized')));
		}

		const authService = await AuthCloudService.createAuthCloudService({
			sessionToken,
		});

		const user = await authService.getUserForSessionToken();

		if (!user) {
			return next(new HttpException(401, t('Invalid session token')));
		}

		const roleService = new RoleService(USE_MASTER_KEY);
		const isUserStaffMemberPromise = roleService.isUserStaffMember(user);

		req.user = user;

		const userRoleNames = await authService.getRoleNamesForSessionToken();

		// --------------------------------------------------------------------------------------//
		//                            any authed user is authorized                              //
		// --------------------------------------------------------------------------------------//
		if (group === userGroup.ANY) {
			const { allowedRoles = roleSet.ALL } = options;

			const allowedRoleNames = _.map(allowedRoles, (role) => role.name);

			if (
				!_.some(userRoleNames, (roleName) =>
					allowedRoleNames.includes(roleName as never),
				)
			) {
				return next(new HttpException(403, t('unauthorized')));
			}

			return next();
		}

		// --------------------------------------------------------------------------------------//
		//       only members of a tenant are authorized (implicitly, staff members too)         //
		// --------------------------------------------------------------------------------------//
		if (group === userGroup.TENANT) {
			// check if tenantId is present in the request
			const tenantIdInHeaders = getHeader(req, TENANT_ID_HEADER_KEY);

			if (!tenantIdInHeaders) {
				return next(
					new HttpException(400, t('item-is-required', { item: 'tenantId' })),
				);
			}

			//.if group === userGroup.TENANT then allowed roleSet is inevitably fixed by us (the developer): roleSet.ABOVE_TENANT_USER
			const roleSetNames = _.map(
				roleSet.ABOVE_TENANT_USER,
				(role) => role.name,
			);

			if (
				!_.some(userRoleNames, (roleName) =>
					roleSetNames.includes(roleName as never),
				)
			) {
				throw new HttpException(403, t('unauthorized'));
			}

			const { allowedTenantSubRoles = tenantSubRoleSet.ALL } = options;

			const tenant = new ParseTenant({ objectId: tenantIdInHeaders });
			const tenantService = new TenantService(USE_MASTER_KEY);

			const userIsMemberOfTenantPromise = tenantService.isUserMemberOfTenant({
				user,
				tenant,
			});
			const userHasRoleInTenantPromise = tenantService.userHasRoleInTenant({
				user,
				tenant,
				tenantSubRoles: allowedTenantSubRoles,
			});

			// is the user a staff member ?
			if (await isUserStaffMemberPromise) {
				// no need to check tenant membership and sub roles
				return next();
			}

			// check if user is member of the requested tenant (tenantId header)
			if (!(await userIsMemberOfTenantPromise)) {
				throw new HttpException(403, t('unauthorized'));
			}

			// check if user has the required sub roles
			if (!(await userHasRoleInTenantPromise)) {
				throw new HttpException(403, t('unauthorized'));
			}

			return next();
		}

		// --------------------------------------------------------------------------------------//
		//                           only staff member are authorized                            //
		// --------------------------------------------------------------------------------------//
		const { allowedRoles = roleSet.STAFF_MEMBER } = options;

		const allowedRoleNames = _.map(allowedRoles, (role) => role.name);

		if (
			!_.some(userRoleNames, (roleName) =>
				allowedRoleNames.includes(roleName as never),
			)
		) {
			return next(new HttpException(403, t('unauthorized')));
		}

		return next();
	});
};

protectionMiddleware.fromAuthedUser = ({
	allowedRoles,
}: {
	allowedRoles?: RoleSet;
}) => {
	return protectionMiddleware({
		authType: 'sessionToken',
		group: userGroup.ANY,
		allowedRoles,
	});
};

protectionMiddleware.fromTenantMember = ({
	allowedTenantSubRoles,
}: {
	allowedTenantSubRoles?: TenantSubRoleSet;
}) => {
	return protectionMiddleware({
		authType: 'sessionToken',
		group: userGroup.TENANT,
		allowedTenantSubRoles,
	});
};

protectionMiddleware.fromStaffMember = ({
	allowedRoles,
}: {
	allowedRoles?: StaffRoleSet;
}) => {
	return protectionMiddleware({
		authType: 'sessionToken',
		group: userGroup.STAFF,
		allowedRoles,
	});
};

export default protectionMiddleware;
