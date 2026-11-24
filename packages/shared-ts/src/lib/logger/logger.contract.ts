export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| Error
	| readonly LogValue[]
	| { [key: string]: LogValue };
export type LogMeta = { [key: string]: LogValue };

/** The port callers depend on. */
export interface ILogger {
	debug(message: string, meta?: LogMeta): void;
	info(message: string, meta?: LogMeta): void;
	warn(message: string, meta?: LogMeta): void;
	error(message: string, meta?: LogMeta): void;
	/** False when this level is dropped: lets a caller skip building costly meta. */
	isLevelEnabled(level: LogLevel): boolean;
}

/** What a sink receives: message and meta are already redacted. */
export type LogEntry = {
	level: LogLevel;
	message: string;
	meta?: LogMeta;
	time: Date;
};

/** The adapter port: one method, no level or redaction logic. */
export interface LogSink {
	write(entry: LogEntry): void;
}

/** For `catch (error)` sites: meta only accepts typed values. */
export const toLogError = (error: unknown): Error =>
	error instanceof Error ? error : new Error(String(error));
