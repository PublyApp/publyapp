import { logger } from 'parse-server';

import { ZodError } from 'zod';

import { defaultLocale } from '@devist/shared/i18n/resources';
import { I18N_LOCALE_KEY, type RolesEnum } from '@devist/shared/utils/constants';

import { getT } from './i18n';

// type InnerFunctionContext = {
// 	req: Parse.Cloud.TriggerRequest;
// 	t:
// }

// type ParseInnerFunction = (req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest) => Promise<unknown>;
type ParseInnerFunction =
	| ((req: Parse.Cloud.TriggerRequest) => Promise<any>)
	| ((req: Parse.Cloud.FunctionRequest) => Promise<any>);

export const parseFunction = (innerFunction: ParseInnerFunction) => {
	return async (req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest): Promise<any> => {
		try {
			let result = await innerFunction(req as any);

			if (result == null) {
				result = 'ok';
			}

			return result;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			// console.log('====================================');
			// console.log(error instanceof ZodError);
			// console.log('====================================');

			if (global.LOCAL) {
				// eslint-disable-next-line no-console
				console.trace(error);
			}

			let message;

			if (error && 'message' in error) {
				message = error.message;
			} else {
				message = 'Unknown error';
			}

			// handle zod errors
			if (error instanceof ZodError) {
				message = error.issues[0].message;
				logger.info(error);
			}

			return Promise.reject(message);
		}
	};
};

type ActionContext2 = {
	req: Parse.Cloud.FunctionRequest;
	t: ReturnType<typeof getT>;
};

type ActionContext1 = {
	req: Parse.Cloud.FunctionRequest;
	t: ReturnType<typeof getT>;
	user: Parse.User;
};

type ParseFromParams =
	| {
			requireUser: true;
			allowedRoles: RolesEnum[];
			action: (ctx: ActionContext1) => Promise<any>;
	  }
	| {
			requireUser: false;
			action: (ctx: ActionContext2) => Promise<any>;
			allowedRoles?: undefined;
	  };

const hasRole = async (user: Parse.User, roles: RolesEnum[]) => {
	const foundRole = await new Parse.Query(Parse.Role)
		.equalTo('users', user)
		.containedIn('code', roles)
		.first({ useMasterKey: true });
	return !!foundRole;
};

export const parseFrom = (params: ParseFromParams) => {
	const actionBuilder = parseFunction(async (req: Parse.Cloud.FunctionRequest) => {
		const { requireUser, action, allowedRoles } = params;

		const { user, headers } = req;

		const locale = headers[I18N_LOCALE_KEY] as string | undefined;

		const t = getT(locale || defaultLocale);

		if (!requireUser) {
			return action({ req, t });
		}

		if (!user) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			throw new Error(t('common:actionRequireAuth')!);
		}

		// verify the roles
		const userHasRole = await hasRole(user, allowedRoles);

		if (!userHasRole) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			throw new Error(t('common:insufficientRoleForAction')!);
		}

		return action({ req, user, t });
	});

	return actionBuilder;
};

type TriggerContext = {
	req: Parse.Cloud.TriggerRequest;
	t: ReturnType<typeof getT>;
};

type ParseTriggerParams = {
	trigger: (ctx: TriggerContext) => Promise<any>;
};

export const parseTrigger = (params: ParseTriggerParams) => {
	const triggerBuilder = parseFunction(async (req: Parse.Cloud.TriggerRequest) => {
		const { trigger } = params;

		const { headers } = req;

		const locale = headers[I18N_LOCALE_KEY] as string | undefined;

		const t = getT(locale || defaultLocale);

		return trigger({ req, t });
	});

	return triggerBuilder;
};
