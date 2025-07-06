import { HttpException } from '@/server/exceptions/HttpException';
import { DISABLE_SIGNUP_CONFIG_KEY } from '@/server/lib/constants';
import { env } from '@/server/lib/env';
import {
	type FunctionParams,
	type FunctionReturn,
	defineCloudFunction,
	fromAuthedUserParseFunction,
	fromPublicParseFunction,
	fromStaffMemberParseFunction,
	parseFunctionEnhanced,
} from '@/server/lib/parse/cloud/function';
import {
	getDatabase,
	getGlobalConfig,
	getInternalConfig,
	parseFields,
	removeParseFields,
} from '@/server/lib/parse/parse.utils';
import { X_CODE, className, functionName } from '@/shared/lib/constants';
import { logger } from '@/shared/lib/winston.server';
import type { IUser } from '@/shared/types/db/user.types';
import {
	getCheckEmailVerificationTokenSchema,
	getCheckResetPasswordTokenSchema,
	getEmailFormSchema,
} from '@/shared/validations/auth.validations';
import { newObjectId } from 'parse-server/lib/cryptoUtils.js';
import { AuthCloudService } from './auth-cloud.service';
import RoleService from './role/role.service';
import type ParseTenant from './tenant/tenant.class';
import TenantService from './tenant/tenant.service';

export namespace GetUserAuthData {
	export type Params = FunctionParams<typeof getUserAuthData>;
	export type Return = FunctionReturn<typeof getUserAuthData>;
}

const getUserAuthData = fromAuthedUserParseFunction({
	name: functionName.auth.getUserAuthData,
	action: async ({ user }) => {
		const sessionToken = user.getSessionToken();

		const rolesPromises = new RoleService({ sessionToken }).getUserRoles(user, {
			json: true,
			exclude: ['rank'],
		});

		let roles = await rolesPromises;
		roles = roles.map((role) => {
			return removeParseFields(role, [
				...parseFields,
				'users',
				'roles',
			]) as never;
		});

		let userJson: IUser = user.toJSON() as never;
		userJson = removeParseFields(userJson, [
			...parseFields,
			'sessionToken',
			'emailVerified',
		]) as never;

		return {
			user: userJson,
			roles,
			sessionToken,
		};
	},
});

export namespace GetIsDisabledSignup {
	// export type Params = FunctionParams<typeof getIsDisabledSignup>;
	export type Return = FunctionReturn<typeof getIsDisabledSignup>;
}

const getIsDisabledSignup = fromPublicParseFunction({
	name: functionName.auth.getIsDisabledSignup,
	action: async () => {
		const globalConfig = await getGlobalConfig();
		const disabledSignup: boolean = globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY);

		return { disabledSignup: Boolean(disabledSignup) };
	},
});

export namespace GetRedirectCode {
	export type Params = FunctionParams<typeof getRedirectCode>;
	export type Return = FunctionReturn<typeof getRedirectCode>;
}

const getRedirectCode = fromAuthedUserParseFunction({
	name: functionName.auth.getRedirectCode,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			tenantId: z.string().optional(),
		});

		return schema.parse(params);
	},
	action: async ({ user, params, log }) => {
		const sessionToken = user.getSessionToken();

		const tenantService = new TenantService({ sessionToken });

		const fallBackTenantPromise = tenantService.findTenantsForUser(user, {
			select: [],
		});
		let tenantExistsPromise: Promise<ParseTenant | undefined> =
			Promise.resolve(undefined);

		if (params.tenantId) {
			tenantExistsPromise = tenantService.getById(params.tenantId, {
				select: [],
			});
		}

		// check user's roles:
		// case 1: user is a staff member
		// case 2: user is a tenant user
		const roleService = new RoleService({ sessionToken });
		const isUserStaffMember = await roleService.isUserStaffMember(user);

		if (isUserStaffMember) {
			if (params.tenantId) {
				const tenant = await tenantExistsPromise;

				if (tenant) {
					return { code: tenant.id };
				}
			}

			return { code: 'staff' };
		}

		// ! no need to check because the allowedRoles is already set to ABOVE_TENANT_USER
		// const userHasTenantRole = roles.some((role) => {
		// 	return TENANT_ROLES.some((tenantRole) => {
		// 		return tenantRole.code === role.code;
		// 	});
		// });

		const tenant = await tenantExistsPromise;

		if (tenant) {
			const isMember = await tenantService.isUserMemberOfTenant({
				user,
				tenant,
			});

			if (isMember) {
				return { code: tenant.id };
			}

			log.warn(
				`Attempt to access tenant ${params.tenantId} by user ${user.id} who is not a member of said tenant`,
				{
					tenantId: params.tenantId,
					userId: user.id,
				},
			);
			return { code: 'unauthorized' };
		}

		const fallBackTenant = (await fallBackTenantPromise)[0];

		if (fallBackTenant) {
			return { code: fallBackTenant.id };
		}

		log.warn(
			`Attempt to access nonexisting tenant ${params.tenantId} by user ${user.id} but it had no fallback tenant`,
			{
				tenantId: params.tenantId,
				userId: user.id,
			},
		);
		return { code: 'unauthorized' };
	},
});

export namespace GetTenantAuthData {
	export type Params = FunctionParams<typeof getTenantAuthData>;
	export type Return = FunctionReturn<typeof getTenantAuthData>;
}

const getTenantAuthData = fromAuthedUserParseFunction({
	name: functionName.auth.getTenantAuthData,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			tenantId: z.string(),
		});

		return schema.parse(params);
	},
	action: async ({ user, params, t, log }) => {
		const sessionToken = user.getSessionToken();

		const roleService = new RoleService({ sessionToken });
		const getIsUserStaffMemberPromise = roleService.isUserStaffMember(user);

		// case 1: tenant id === 'staff'
		if (params.tenantId === 'staff') {
			const isUserStaffMember = await getIsUserStaffMemberPromise;

			if (isUserStaffMember) {
				return {
					// permissions: ['*'],
				};
			}

			log.warn(
				`Attempt to access staff auth data by user ${user.id} who is not a staff member`,
				{
					userId: user.id,
				},
			);
			throw new HttpException(403, t('unauthorized'));
		}

		// check if tenant exists
		const tenantService = new TenantService({ sessionToken });
		const tenant = await tenantService.getById(params.tenantId, { select: [] });

		if (!tenant) {
			throw new HttpException(404, t('item-not-found', { item: 'Tenant' }));
		}

		// check if user is staff member
		const isUserStaffMember = await getIsUserStaffMemberPromise;

		if (isUserStaffMember) {
			return {
				// permissions: ['*'],
			};
		}

		// check if user is member of the tenant
		const isMember = await tenantService.isUserMemberOfTenant({ user, tenant });

		if (!isMember) {
			log.warn(
				`Attempt to access tenant auth data ${params.tenantId} by user ${user.id} who is not member of said tenant`,
				{
					userId: user.id,
					tenantId: params.tenantId,
				},
			);
			throw new HttpException(403, t('unauthorized'));
		}

		return {
			// permissions: ['*'],
		};
	},
});

export namespace CheckEmailVerificationToken {
	export type Params = FunctionParams<typeof checkEmailVerificationToken>;
	export type Return = FunctionReturn<typeof checkEmailVerificationToken>;
}

const checkEmailVerificationToken = fromPublicParseFunction({
	name: functionName.auth.checkEmailVerificationToken,
	validateParams({ params, z }) {
		const schema = getCheckEmailVerificationTokenSchema(z);
		return schema.parse(params);
	},
	action: async ({ params, t }) => {
		// check if token/email pair is valid
		// if valid, set email as verified, unset token + unset email_verify_token_expires_at
		const UserCollection = getDatabase().collection(className.USER);

		const user = await UserCollection.findOne(
			{
				email: params.email,
				_email_verify_token: params.token,
			},
			{
				projection: {
					_id: 1,
					email: 1,
					_email_verify_token: 1,
					_email_verify_token_expires_at: 1,
				},
			},
		);

		if (!user) {
			throw new HttpException(
				400,
				t('item-is-invalid', { item: 'Email/Token' }),
				{
					xcode: X_CODE.INVALID_EMAIL_VERIFICATION_TOKEN,
					meta: { cause: 'User not found' },
				},
			);
		}

		const isExpired = user._email_verify_token_expires_at < new Date();

		if (isExpired) {
			throw new HttpException(
				400,
				t('item-is-invalid', { item: 'Email/Token' }),
				{
					xcode: X_CODE.INVALID_EMAIL_VERIFICATION_TOKEN,
					meta: { cause: 'Token expired' },
				},
			);
		}

		const config = getInternalConfig();

		const passwordResetTokenData: {
			_perishable_token: string;
			_perishable_token_expires_at?: string;
		} = {
			_perishable_token: newObjectId(25),
		};

		if (config.passwordPolicy?.resetTokenValidityDuration) {
			passwordResetTokenData._perishable_token_expires_at =
				config.generatePasswordResetTokenExpiresAt();
		}

		// set email as verified, unset token + unset email_verify_token_expires_at
		// set password reset token to let the user create a new password
		await UserCollection.updateOne(
			{
				_id: user._id,
			},
			{
				$set: {
					emailVerified: true,
					...passwordResetTokenData,
				},
				$unset: {
					_email_verify_token: 1,
					_email_verify_token_expires_at: 1,
				},
			},
		);

		return {
			status: 'success',
			token: passwordResetTokenData._perishable_token,
		} as const;
	},
});

export namespace CheckResetPasswordToken {
	export type Params = FunctionParams<typeof checkResetPasswordToken>;
	export type Return = FunctionReturn<typeof checkResetPasswordToken>;
}

const checkResetPasswordToken = fromPublicParseFunction({
	name: functionName.auth.checkResetPasswordToken,
	validateParams: ({ params, z }) => {
		const schema = getCheckResetPasswordTokenSchema(z);
		return schema.parse(params);
	},
	action: async ({ params, t }) => {
		const UserCollection = getDatabase().collection(className.USER);

		const user = await UserCollection.findOne(
			{
				_perishable_token: params.token,
				email: params.email,
			},
			{
				projection: {
					_perishable_token_expires_at: 1,
				},
			},
		);

		if (!user) {
			throw new HttpException(
				400,
				t('item-is-invalid', { item: 'Email/Token' }),
				{
					xcode: X_CODE.INVALID_RESET_PASSWORD_TOKEN,
					meta: { cause: 'User not found' },
				},
			);
		}

		const isExpired = user._perishable_token_expires_at < new Date();

		if (isExpired) {
			throw new HttpException(
				400,
				t('item-is-invalid', { item: 'Email/Token' }),
				{
					xcode: X_CODE.INVALID_RESET_PASSWORD_TOKEN,
					meta: { cause: 'Token expired' },
				},
			);
		}

		return { status: 'success' } as const;
	},
});

export namespace RequestEmailVerification {
	export type Params = FunctionParams<typeof requestEmailVerification>;
	export type Return = FunctionReturn<typeof requestEmailVerification>;
}

const requestEmailVerification = fromPublicParseFunction({
	name: functionName.auth.requestEmailVerification,
	validateParams: ({ params, z }) => {
		const schema = getEmailFormSchema(z);
		return schema.parse(params);
	},
	action: async ({ params }) => {
		const db = getDatabase();
		const UserCollection = db.collection(className.USER);

		const user = await UserCollection.findOne(
			{
				email: params.email,
			},
			{
				projection: {
					_id: 1,
					email: 1,
					emailVerified: 1,
					_email_verify_token: 1,
					_email_verify_token_expires_at: 1,
				},
			},
		);

		if (!user) {
			logger.warn('User not found for email verification request', {
				email: params.email,
			});
			return { status: 'processed' } as const;
		}

		if (user.emailVerified) {
			logger.warn('User already verified for email verification request', {
				email: params.email,
			});
			return { status: 'processed' } as const;
		}

		const config = getInternalConfig();

		if (
			config.emailVerifyTokenReuseIfValid &&
			config.emailVerifyTokenValidityDuration &&
			user._email_verify_token &&
			new Date() < new Date(user._email_verify_token_expires_at)
		) {
			// logger.warn("User already has a valid email verification token", { email: params.email });
			return { status: 'processed' } as const;
		}

		const emailVerifyData: {
			emailVerified: boolean;
			_email_verify_token: string;
			_email_verify_token_expires_at?: string;
		} = {
			emailVerified: false,
			_email_verify_token: newObjectId(25),
		};

		if (config.emailVerifyTokenValidityDuration) {
			emailVerifyData._email_verify_token_expires_at =
				config.generateEmailVerifyTokenExpiresAt();
		}

		await UserCollection.updateOne(
			{ _id: user._id },
			{
				$set: emailVerifyData,
			},
		);

		return { status: 'success' } as const;
	},
});

export namespace GetVerificationLink {
	export type Params = FunctionParams<typeof getVerificationLink>;
	export type Return = FunctionReturn<typeof getVerificationLink>;
}

const getVerificationLink = fromStaffMemberParseFunction({
	name: functionName.auth.getVerificationLink,
	validateParams: ({ params, z }) => {
		const schema = z.object({
			userId: z.string(),
		});
		return schema.parse(params);
	},
	action: async ({ params, t }) => {
		const user = await getDatabase()
			.collection(className.USER)
			.findOne(
				{
					_id: params.userId as never,
				},
				{ projection: { email: 1, _email_verify_token: 1 } },
			);

		if (!user) {
			throw new HttpException(404, t('item-not-found', { item: t('user') }));
		}

		const link = await AuthCloudService.getCustomVerificationLink({
			token: user._email_verify_token,
			email: user.email,
			serverUrl: env.FRONT_URL,
		});

		return {
			link,
		} as const;
	},
});

//--------------------------------------------------------------------------------------//
//                                 Define the functions                                 //
//--------------------------------------------------------------------------------------//

defineCloudFunction(getUserAuthData);
defineCloudFunction(getTenantAuthData);
defineCloudFunction(getIsDisabledSignup);
defineCloudFunction(getRedirectCode);
defineCloudFunction(checkEmailVerificationToken);
defineCloudFunction(checkResetPasswordToken);
defineCloudFunction(requestEmailVerification);
defineCloudFunction(getVerificationLink);

// --------------------------------------------------------------------------------------//
//                                       SEEDING                                        //
// --------------------------------------------------------------------------------------//

const removeSeededUsersFunction = parseFunctionEnhanced({
	name: functionName.auth.removeSeededUsers,
	requireMasterKey: true,
	action: async () => {
		const User = getDatabase().collection(className.USER);

		const userResult = await User.deleteMany({ seeded: true });

		return { userResult };
	},
});

defineCloudFunction(removeSeededUsersFunction);
