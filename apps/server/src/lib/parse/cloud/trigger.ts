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
import { logger } from '../../winston';

export const triggerType = {
	beforeLogin: 'beforeLogin',
	afterLogin: 'afterLogin',
	afterLogout: 'afterLogout',
	beforeSave: 'beforeSave',
	afterSave: 'afterSave',
	beforeDelete: 'beforeDelete',
	afterDelete: 'afterDelete',
	beforeFind: 'beforeFind',
	afterFind: 'afterFind',
	beforeConnect: 'beforeConnect',
	beforeSubscribe: 'beforeSubscribe',
	afterEvent: 'afterEvent',
} as const;

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
	tenantId: string;
};

type MultiTenantTriggerParams = {
	trigger: (ctx: MultiTenantTriggerContext) => Promise<void>;
};

export const multiTenantTrigger = (params: MultiTenantTriggerParams) => {
	return parseTriggerEnhanced({
		trigger: async ({ locale, req, t }) => {
			const { trigger } = params;

			if (req.triggerName === triggerType.beforeFind) {
				const tenantIdInContext: string | undefined = _.get(
					req.context,
					'tenantId',
				) as string | undefined;
				const tenantIdInHeaders = getParseFunctionHeader(
					req,
					TENANT_ID_HEADER_KEY,
				);
				const tenantIdInQuery: string | undefined = _.get(
					req.query?.toJSON(),
					'where.tenant.objectId',
				);

				const tenantId =
					tenantIdInContext || tenantIdInHeaders || tenantIdInQuery;

				if (!tenantId) {
					throw new HttpException(
						401,
						t('item-is-required', { item: 'tenantId' }),
					);
				}

				const tenantObject = new ParseTenant();
				tenantObject.id = tenantId;

				if (!tenantIdInQuery) {
					req.query?.equalTo('tenant', tenantObject);
				}

				if (req.master) {
					return trigger({ locale, req, t, tenantId });
				}

				if (!req.user) {
					throw new HttpException(
						401,
						t('item-is-required', { item: t('authentication') }),
					);
				}

				const sessionToken = req.user.getSessionToken();

				// if (await isFromCloudEnvironment(req)) {
				// 	return trigger({ locale, req, t, tenantId });
				// }

				// * no need to check ip because it is already done in: parseTriggerEnhanced function

				const tenantService = new TenantService({ sessionToken });
				const isUserMemberOfTenant = await tenantService.isUserMemberOfTenant({
					user: req.user,
					tenant: tenantObject,
				});

				if (!isUserMemberOfTenant) {
					throw new HttpException(403, t('unauthorized'));
				}

				return trigger({ locale, req, t, tenantId });
			}

			if (req.triggerName === triggerType.afterFind) {
				const tenantIdInContext: string | undefined = _.get(
					req.context,
					'tenantId',
				) as string | undefined;
				const tenantIdInHeaders = getParseFunctionHeader(
					req,
					TENANT_ID_HEADER_KEY,
				);
				const tenantIdInQuery: string | undefined = _.get(
					req.query?.toJSON(),
					'where.tenant.objectId',
				);

				const tenantId =
					tenantIdInContext || tenantIdInHeaders || tenantIdInQuery;

				if (!tenantId) {
					throw new HttpException(
						401,
						t('item-is-required', { item: 'tenantId' }),
					);
				}

				return trigger({ locale, req, t, tenantId });
			}

			if (
				req.triggerName === triggerType.beforeSave ||
				req.triggerName === triggerType.beforeDelete
			) {
				// const tenantIdInContext: string | undefined = _.get(
				// 	req.context,
				// 	'tenantId',
				// ) as string | undefined;
				// const tenantIdInHeaders = getParseFunctionHeader(
				// 	req,
				// 	TENANT_ID_HEADER_KEY,
				// );
				const tenantInObject = req.original?.id;

				const tenantId =
					/* tenantIdInContext || tenantIdInHeaders || */ tenantInObject;

				if (!tenantId) {
					throw new HttpException(
						401,
						t('item-is-required', { item: 'tenantId' }),
					);
				}

				const tenantObject = new ParseTenant();
				tenantObject.id = tenantId;

				// if (!tenantIdInQuery) {
				// 	req.query?.equalTo('tenant', tenantObject);
				// }

				if (req.master) {
					return trigger({ locale, req, t, tenantId });
				}

				if (!req.user) {
					throw new HttpException(
						401,
						t('item-is-required', { item: t('authentication') }),
					);
				}

				const sessionToken = req.user.getSessionToken();

				// if (await isFromCloudEnvironment(req)) {
				// 	return trigger({ locale, req, t, tenantId });
				// }

				// * no need to check ip because it is already done in: parseTriggerEnhanced function

				const tenantService = new TenantService({ sessionToken });
				const isUserMemberOfTenant = await tenantService.isUserMemberOfTenant({
					user: req.user,
					tenant: tenantObject,
				});

				if (!isUserMemberOfTenant) {
					throw new HttpException(403, t('unauthorized'));
				}

				return trigger({ locale, req, t, tenantId });
			}

			if (
				req.triggerName === triggerType.afterSave ||
				req.triggerName === triggerType.beforeDelete
			) {
				// const tenantIdInContext: string | undefined = _.get(
				// 	req.context,
				// 	'tenantId',
				// ) as string | undefined;
				// const tenantIdInHeaders = getParseFunctionHeader(
				// 	req,
				// 	TENANT_ID_HEADER_KEY,
				// );
				const tenantInObject = req.original?.id;

				const tenantId =
					/* tenantIdInContext || tenantIdInHeaders || */ tenantInObject;

				if (!tenantId) {
					throw new HttpException(
						401,
						t('item-is-required', { item: 'tenantId' }),
					);
				}

				return trigger({ locale, req, t, tenantId });
			}

			logger.error(
				`cannot use trigger type ${req.triggerName} as multi-tenant trigger`,
				{
					triggerName: req.triggerName,
				},
			);
			throw new HttpException(500, t('Internal server error'));
		},
	});
};
