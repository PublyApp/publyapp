import { HttpException } from '@/server/exceptions/HttpException';
import {
	FORWARDED_FOR_HEADER_KEY,
	LOCALE_HEADER_KEY,
	REMIX_CLIENT_IP_HEADER_KEY,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@org/shared/lib/i18n/i18n.utils';
import chalk from 'chalk';
import _ from 'lodash';
import type { LoggerController } from 'parse-server/lib/Controllers/LoggerController';
import { newObjectId } from 'parse-server/lib/cryptoUtils.js';
import { ZodError } from 'zod';
import { CONFIG_ENABLE_CHECK_SESSION_IP } from '../../constants';
import { env } from '../../env';
import { getT } from '../../i18n';
import { getCurrentInstallationId, getInternalConfig } from '../parse.utils';

export type ParseFunction<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
> = (req: Parse.Cloud.FunctionRequest<P>) => Promise<T>;

export type ParseTrigger<P extends Parse.Object = Parse.Object, T = unknown> = (
	req: Parse.Cloud.TriggerRequest<P>,
) => Promise<T>;

export type ParseJob<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
> = (req: Parse.Cloud.JobRequest<P>) => Promise<T>;

type FunctionType = 'trigger' | 'function' | 'job';

const getParseFunctionType = (
	req:
		| Parse.Cloud.TriggerRequest
		| Parse.Cloud.FunctionRequest
		| Parse.Cloud.JobRequest,
): FunctionType => {
	const hasTriggerName = {
		type: 'trigger' as const,
		condition:
			_.has(req, 'triggerName') &&
			!_.isNil(req.triggerName) &&
			_.isString(req.triggerName),
	};
	const hastFunctionName = {
		type: 'function' as const,
		condition:
			_.has(req, 'functionName') &&
			!_.isNil(req.functionName) &&
			_.isString(req.functionName),
	};
	const hasJobName = {
		type: 'job' as const,
		condition:
			_.has(req, 'jobName') && !_.isNil(req.jobName) && _.isString(req.jobName),
	};

	const truthyConditions = [
		hasTriggerName,
		hastFunctionName,
		hasJobName,
	].filter((value) => {
		return value.condition === true;
	});

	if (truthyConditions.length > 1) {
		throw new Error('Multiple function types detected');
	}

	if (truthyConditions.length <= 0) {
		throw new Error('Unknown parse function type');
	}

	return truthyConditions[0].type;
};

const isTriggerRequest = (
	req:
		| Parse.Cloud.TriggerRequest
		| Parse.Cloud.FunctionRequest
		| Parse.Cloud.JobRequest,
): req is Parse.Cloud.TriggerRequest => {
	return getParseFunctionType(req) === 'trigger';
};

const getParseFunctionName = ({
	req,
	functionType,
}: {
	req:
		| Parse.Cloud.FunctionRequest
		| Parse.Cloud.TriggerRequest
		| Parse.Cloud.JobRequest;
	functionType: FunctionType;
}) => {
	let functionName: string | undefined;

	if (functionType === 'function') {
		functionName = _.get(req, 'functionName');
	}

	if (functionType === 'trigger') {
		functionName = _.get(req, 'triggerName');
	}

	if (functionType === 'job') {
		functionName = _.get(req, 'jobName');
	}

	if (!functionName) {
		throw new Error('functionName has an incorrect value');
	}

	return functionName;
};

export const alterLogger = ({
	req,
	functionType,
	functionName,
}: {
	req:
		| Parse.Cloud.FunctionRequest
		| Parse.Cloud.TriggerRequest
		| Parse.Cloud.JobRequest;
	functionType: FunctionType;
	functionName: string;
}) => {
	let highlighted = `${_.capitalize(functionType)} :: ${functionName}`;

	if (functionType === 'function' || functionType === 'trigger') {
		// _.set(req, 'context.___do_not_use_altered_logger_marker___', true); // impossible to set context outside of cloud function or triggers
		_.set(req, 'headers.___do_not_use_altered_logger_marker___', true);
	}

	if (functionType === 'trigger') {
		if (functionName === 'beforeSave') {
			const request = req as Parse.Cloud.BeforeSaveRequest;
			highlighted = `${highlighted} :: ${request.object.className}`;
		}

		if (functionName === 'afterSave') {
			const request = req as Parse.Cloud.AfterSaveRequest;
			highlighted = `${highlighted} :: ${request.object.className}`;
		}

		if (functionName === 'beforeFind') {
			const request = req as Parse.Cloud.BeforeFindRequest;
			highlighted = `${highlighted} :: ${request.query.className}`;
		}

		if (functionName === 'afterFind') {
			const request = req as Parse.Cloud.AfterFindRequest;
			highlighted = `${highlighted} :: ${request.query?.className}`;
		}

		if (functionName === 'beforeDelete') {
			const request = req as Parse.Cloud.BeforeDeleteRequest;
			highlighted = `${highlighted} :: ${request.object.className}`;
		}

		if (functionName === 'afterDelete') {
			const request = req as Parse.Cloud.AfterDeleteRequest;
			highlighted = `${highlighted} :: ${request.object.className}`;
		}
	}

	const execId = newObjectId();

	const oldLog: LoggerController = req.log;
	const newLog = {
		...oldLog,
		adapter: oldLog.adapter,
		info: (...args: unknown[]) => {
			args[0] = `${chalk.cyan(`(${execId})`)} ${chalk.magenta(`[ ${highlighted} ]`)} >> ${args[0]}`;
			oldLog.info(...args);
		},
		warn: (...args: unknown[]) => {
			args[0] = `${chalk.cyan(`(${execId})`)} ${chalk.magenta(`[ ${highlighted} ]`)} >> ${args[0]}`;
			oldLog.warn(...args);
		},
		error: (...args: unknown[]) => {
			args[0] = `${chalk.cyan(`(${execId})`)} ${chalk.magenta(`[${highlighted}]`)} >> ${args[0]}`;
			oldLog.error(...args);
		},
	} as LoggerController;
	req.log = newLog;
};

type CloudFunction = {
	<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
		innerFunction: ParseFunction<P, T>,
	): ParseFunction<P, T>;
	<P extends Parse.Object = Parse.Object, T = unknown>(
		innerFunction: ParseTrigger<P, T>,
	): ParseTrigger<P, T>;
	<P extends Parse.Cloud.Params = Parse.Cloud.Params, T = unknown>(
		innerFunction: ParseJob<P, T>,
	): ParseJob<P, T>;
};

type ParseInnerFunction<
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
	O extends Parse.Object = Parse.Object,
> = ParseFunction<P, T> | ParseTrigger<O, T> | ParseJob<P, T>;

export const cloudFunction: CloudFunction = <
	P extends Parse.Cloud.Params = Parse.Cloud.Params,
	T = unknown,
>(
	innerFunction: ParseInnerFunction<P, T>,
) => {
	return async (
		req:
			| Parse.Cloud.FunctionRequest<P>
			| Parse.Cloud.TriggerRequest
			| Parse.Cloud.JobRequest<P>,
	): Promise<T> => {
		const functionType = getParseFunctionType(req);
		const functionName = getParseFunctionName({ req, functionType });
		alterLogger({ req, functionName, functionType });

		const log: LoggerController = req.log;

		try {
			if (env.LOCAL) {
				log.info(`${functionType} started`, {
					user: _.get(req, 'user.id', undefined),
					params: _.get(req, 'params', {}),
				});
			}
			const t1 = performance.now();
			const result = await innerFunction(req as never);
			const t2 = performance.now();
			if (env.LOCAL) {
				log.info(`${functionType} finished in ${(t2 - t1).toFixed(2)} ms`, {
					result,
				});
			}

			return result;
		} catch (error: unknown) {
			const localeInHeader = getCorrectLocale(
				getParseFunctionHeader(req, LOCALE_HEADER_KEY),
			);

			let t = getT(localeInHeader);

			const isTrigger = isTriggerRequest(req);

			if (isTrigger) {
				const localeInContext = getCorrectLocale(
					_.isString(req.context?.locale) ? req.context.locale : undefined,
				);

				if (localeInContext !== localeInHeader) {
					t = getT(localeInContext);
				}
			} else {
				// do nothing
			}

			let message: string = t('unknown-error');

			if (_.isString(error)) {
				message = error;
			}

			// get zod errors message
			if (error instanceof ZodError) {
				message = error.issues[0].message;
				log.error(message);
				return Promise.reject(message);
			}

			if (error instanceof Error) {
				let hasMessage: boolean;

				if (!error.message) {
					hasMessage = false;
					message = !String(error.message) ? message : String(error.message);
				} else {
					hasMessage = true;
					message = error.message;
				}

				log.error(hasMessage ? '' : message, error);

				if (error instanceof HttpException) {
					return Promise.reject(
						new CloudFunctionHttpException(error.status, message, {
							xcode: error.xcode,
							body: error.body,
						}),
					);
				}

				return Promise.reject(error);
			}

			log.error(message);
			return Promise.reject(message);
		}
	};
};

export const getParseFunctionHeader = (
	req:
		| Parse.Cloud.TriggerRequest
		| Parse.Cloud.FunctionRequest
		| Parse.Cloud.JobRequest,
	key: string,
): string | undefined => {
	return (
		_.get(req, `headers.${key}`) || _.get(req, `headers.${_.toLower(key)}`)
	);
};

// ! Do not use this class directly outside this module/file
// ! only use the isCloudHttpException utility below
class CloudFunctionHttpException extends Parse.Error {
	status: number;
	xcode?: string;
	body?: Record<string, unknown>;

	constructor(
		status: number,
		message: string,
		options?: { xcode?: string; body?: Record<string, unknown> },
	) {
		super(Parse.Error.SCRIPT_FAILED, message);
		this.status = status;
		this.xcode = options?.xcode;
		this.body = options?.body;
	}
}

export const isCloudHttpException = (
	error: unknown,
): error is CloudFunctionHttpException => {
	return error instanceof CloudFunctionHttpException;
};

// * verify if the call is not from our cloud code (not from our server itself)
export const isFromCloudEnvironment = async (
	req: Parse.Cloud.FunctionRequest | Parse.Cloud.TriggerRequest,
) => {
	const cloudInstallationId = await getCurrentInstallationId();
	const { directAccess } = getInternalConfig();

	const definitelyNotFromCloud = directAccess && req.installationId !== 'cloud';
	const alsoNotFromCloud =
		!directAccess && req.installationId !== cloudInstallationId;

	return !(definitelyNotFromCloud || alsoNotFromCloud);
};

export const isNotValidIp = async ({
	req,
	sessionToken,
}: {
	req: Parse.Cloud.FunctionRequest | Parse.Cloud.TriggerRequest;
	sessionToken: string;
}) => {
	if (!CONFIG_ENABLE_CHECK_SESSION_IP) {
		return false;
	}

	const session = await new Parse.Query(Parse.Session)
		.equalTo('sessionToken', sessionToken)
		.select(['ipAddress'])
		.first({ sessionToken });

	const requestIp =
		getParseFunctionHeader(req, REMIX_CLIENT_IP_HEADER_KEY) ||
		getParseFunctionHeader(req, FORWARDED_FOR_HEADER_KEY);

	const localMatchConditionIp =
		env.LOCAL && session?.get('ipAddress') !== req.ip;
	const onlineMatchConditionIp =
		!env.LOCAL && session?.get('ipAddress') !== requestIp;

	return localMatchConditionIp || onlineMatchConditionIp;
};
