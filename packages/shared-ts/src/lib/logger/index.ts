import { isServer } from '../constants';
import { BrowserConsoleLoggerAdapter } from './adapters/browser-console-logger-adapter';
import { JsonLoggerAdapter } from './adapters/json-logger-adapter';
import { MemoryLoggerAdapter } from './adapters/memory-logger-adapter';
import {
	createBrowserWinstonAdapter,
	createServerWinstonAdapter,
} from './adapters/winston-logger-adapter';
import { type LogEnv, parseLevel, readEnv, resolveLevel } from './log-level';
import { Logger } from './logger';
import type { ILogger } from './logger.types';

export * from './logger.types';
export { Logger } from './logger';
export { MemoryLoggerAdapter } from './adapters/memory-logger-adapter';

const winstonAdapter = (server: boolean): ILogger =>
	server ? createServerWinstonAdapter() : createBrowserWinstonAdapter();

const autoAdapter = (env: LogEnv, server: boolean): ILogger => {
	if (env.NODE_ENV === 'test') {
		return new MemoryLoggerAdapter();
	}
	if (env.NODE_ENV === 'production') {
		return server ? new JsonLoggerAdapter() : new BrowserConsoleLoggerAdapter();
	}
	return winstonAdapter(server);
};

const isKnownAdapter = (name: string): name is 'winston' | 'json' =>
	name === 'winston' || name === 'json';

/** `LOG_ADAPTER=winston|json` forces an adapter; anything else is automatic. */
export const resolveAdapter = (
	env: LogEnv = readEnv(),
	server: boolean = isServer,
): ILogger => {
	if (env.LOG_ADAPTER === 'winston') {
		return winstonAdapter(server);
	}
	if (env.LOG_ADAPTER === 'json') {
		return new JsonLoggerAdapter();
	}
	return autoAdapter(env, server);
};

const env = readEnv();
export const logger = new Logger(resolveAdapter(env), resolveLevel(env));

if (env.LOG_ADAPTER && !isKnownAdapter(env.LOG_ADAPTER)) {
	logger.warn('Invalid LOG_ADAPTER, using automatic selection', {
		value: env.LOG_ADAPTER,
	});
}
if (env.LOG_LEVEL && !parseLevel(env.LOG_LEVEL)) {
	logger.warn('Invalid LOG_LEVEL, using the default', { value: env.LOG_LEVEL });
}
