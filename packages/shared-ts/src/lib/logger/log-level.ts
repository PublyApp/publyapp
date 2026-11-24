import { LOG_LEVELS, type LogLevel } from './logger.types';

export type LogEnv = {
	NODE_ENV?: string;
	LOG_LEVEL?: string;
	LOG_ADAPTER?: string;
};

type NodeProcess = {
	env: Record<string, string | undefined>;
	stdout: { write(chunk: string): boolean };
	on(event: 'beforeExit' | 'exit', listener: () => void): NodeProcess;
};

/** Undefined in browsers. Typed here so shared-ts needs no Node typings. */
export const nodeProcess = (globalThis as { process?: NodeProcess }).process;

const viteEnv = (
	import.meta as ImportMeta & { env?: Record<string, string | undefined> }
).env;

export const readEnv = (): LogEnv => ({
	NODE_ENV: nodeProcess?.env.NODE_ENV ?? viteEnv?.MODE,
	LOG_LEVEL: nodeProcess?.env.LOG_LEVEL ?? viteEnv?.VITE_LOG_LEVEL,
	LOG_ADAPTER: nodeProcess?.env.LOG_ADAPTER ?? viteEnv?.VITE_LOG_ADAPTER,
});

export const parseLevel = (raw: string | undefined): LogLevel | undefined =>
	LOG_LEVELS.find((level) => level === raw?.toLowerCase());

/** `LOG_LEVEL` wins; otherwise `info` in production, `debug` elsewhere. */
export const resolveLevel = (env: LogEnv): LogLevel =>
	parseLevel(env.LOG_LEVEL) ??
	(env.NODE_ENV === 'production' ? 'info' : 'debug');
