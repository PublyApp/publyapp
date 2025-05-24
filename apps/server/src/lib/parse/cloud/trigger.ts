import type { AppLocale } from '@/shared/lib/i18n/resources';
import { getT } from '../../i18n';
import {
	cloudFunction,
	getParseFunctionHeader,
	isFromCloudEnvironment,
	isNotValidIp,
	type ParseTrigger,
} from './core';
import _ from 'lodash';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import {
	LOCALE_HEADER_KEY,
	TENANT_ID_HEADER_KEY,
} from '@/shared/lib/constants';
import { HttpException } from '@/server/exceptions/HttpException';
import ParseTenant from '@/server/modules/common/auth/tenant/tenant.class';
import TenantService from '@/server/modules/common/auth/tenant/tenant.service';

type TriggerContext<P extends Parse.Object = Parse.Object> = {
	req: Parse.Cloud.TriggerRequest<P>;
	t: ReturnType<typeof getT>;
	locale: AppLocale;
};

export const parseTrigger = <
	P extends Parse.Object = Parse.Object,
	T = unknown,
>(
	innerFunction: ParseTrigger<P, T>,
) => {
	return cloudFunction<P, T>(innerFunction);
};

type ParseTriggerEnhancedParams<P extends Parse.Object = Parse.Object> = {
	trigger: (ctx: TriggerContext<P>) => Promise<void>;
};

export const parseTriggerEnhanced = <P extends Parse.Object = Parse.Object>(
	params: ParseTriggerEnhancedParams<P>,
) => {
	const triggerBuilder = parseTrigger(
		async (req: Parse.Cloud.TriggerRequest<P>) => {
			const { trigger } = params;

			const localeInHeaders = getParseFunctionHeader(req, LOCALE_HEADER_KEY);
			const localeInContext = _.isString(req.context?.locale)
				? req.context.locale
				: undefined;

			const locale = getCorrectLocale(localeInContext || localeInHeaders);
			const t = getT(locale);

			if (req.master) {
				return trigger({ req, t, locale });
			}

			if (await isFromCloudEnvironment(req)) {
				return trigger({ req, t, locale });
			}

			if (req.user) {
				if (
					await isNotValidIp({ sessionToken: req.user.getSessionToken(), req })
				) {
					throw new HttpException(401, t('invalid-session'));
				}
			}

			return trigger({ req, t, locale });
		},
	);

	return triggerBuilder;
};

type MultiTenantTriggerContext = TriggerContext & {
	tenantId?: string;
};

type MultiTenantTriggerParams = {
	trigger: (ctx: MultiTenantTriggerContext) => Promise<void>;
};

/**
 * ! Warning!!!!!!!! This is a work in progress
 */
export const multiTenantTrigger = (params: MultiTenantTriggerParams) => {
	return parseTriggerEnhanced({
		trigger: async ({ locale, req, t }) => {
			const { trigger } = params;

			if (req.master) {
				return trigger({ locale, req, t });
			}

			if (!req.user) {
				throw new HttpException(
					401,
					t('item-is-required', { item: t('authentication') }),
				);
			}

			const sessionToken = req.user.getSessionToken();

			if (req.triggerName === 'beforeFind') {
				const tenantIdInHeaders = getParseFunctionHeader(
					req,
					TENANT_ID_HEADER_KEY,
				);
				const tenantIdInQuery: string | undefined = _.get(
					req.query?.toJSON(),
					'where.tenant.objectId',
				);

				const tenantId = tenantIdInHeaders || tenantIdInQuery;

				if (!tenantId) {
					throw new HttpException(
						401,
						t('item-is-required', { item: 'tenantId' }),
					);
				}

				const tenantObject = new ParseTenant();
				tenantObject.id = tenantId;

				const tenantService = new TenantService({ sessionToken });
				const isUserMemberOfTenant = await tenantService.isUserMemberOfTenant({
					user: req.user,
					tenant: tenantObject,
				});

				if (!isUserMemberOfTenant) {
					throw new HttpException(403, t('unauthorized'));
				}
				// return trigger({ locale, req, t });
			}

			// // TODO: verify if user is member of requested tenant ???
			// const isUserMemberOfTenant = await TenantService.isUserMemberOfTenant({ user: req.user, tenant });

			// if (!isUserMemberOfTenant) {
			// 	throw new Error(t('unauthorized'));
			// }

			// const tenant = new Parse.Object(appClassName.TENANT);
			// tenant.id = tenantIdInHeaders;
			// req.query?.equalTo('tenant', tenant);
			return trigger({ locale, req, t });
		},

		// const { headers, context } = req;
		// const fromPublic = context?.fromPublic;
		// const fromStaff = context?.fromStaff;

		//
		// let _headers: Record<string, unknown> = {};

		// if (_.isObject(headers) && !_.isEmpty(headers)) {
		// 	_headers = headers as never;
		// } else if (_.isObject(context?.headers) && !_.isEmpty(context.headers)) {
		// 	_headers = context.headers as never;
		// }

		//
		// const _tenantId = _headers[_.toLower(TENANT_ID_HEADER_KEY)];
		// const tenantId = _.isString(_tenantId) ? _tenantId : undefined;

		// if (req.triggerName === 'beforeFind') {
		// 	if (!tenantId && !req.master && !fromStaff && !fromPublic) {
		// 		throw new Error(t('item-is-required', { item: 'tenantId' }));
		// 	}

		// 	// if (isPublic) {
		// 	// 	return trigger({ locale, req, t });
		// 	// }

		// 	if (tenantId) {
		// 		req.query?.equalTo('tenant', tenantId);
		// 		return trigger({ locale, req, t, tenantId });
		// 	}
		// }

		// return trigger({ locale, req, t });
		// }
	});
};
