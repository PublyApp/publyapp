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

/** What the service hands an adapter: message and meta are already redacted. */
export type LogEntry = {
	level: LogLevel;
	message: string;
	meta?: LogMeta;
	time: Date;
};

/** The adapter port: one method, no filtering and no redaction. */
export interface ILogger {
	write(entry: LogEntry): void;
}

/** `catch (error)` sites: a plain-object throw keeps its fields instead of `[object Object]`. */
export const toLogError = (error: unknown): LogValue =>
	typeof error === 'object' && error !== null
		? (error as LogValue)
		: new Error(String(error));
