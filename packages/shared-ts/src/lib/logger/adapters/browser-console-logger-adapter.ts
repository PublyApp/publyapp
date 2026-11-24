import type { ILogger, LogEntry, LogLevel } from '../logger.types';

type LevelStyle = { badge: string; text: string };

const LEVEL_STYLES = {
	debug: {
		badge:
			'background:#6c757d;color:white;padding:2px 6px;border-radius:3px;font-weight:bold;font-size:11px;',
		text: 'color:#6c757d;font-weight:normal;',
	},
	info: {
		badge:
			'background:#0dcaf0;color:black;padding:2px 6px;border-radius:3px;font-weight:bold;font-size:11px;',
		text: 'color:#0dcaf0;font-weight:normal;',
	},
	warn: {
		badge:
			'background:#ffc107;color:black;padding:2px 6px;border-radius:3px;font-weight:bold;font-size:11px;',
		text: 'color:#ffc107;font-weight:normal;',
	},
	error: {
		badge:
			'background:#dc3545;color:white;padding:2px 6px;border-radius:3px;font-weight:bold;font-size:11px;',
		text: 'color:#dc3545;font-weight:normal;',
	},
} satisfies Record<LogLevel, LevelStyle>;

type Options = { pretty?: boolean };

/**
 * Browser console. Production: one sober call per entry. Development: a
 * coloured level badge, with meta expanded under a `console.group`.
 */
export class BrowserConsoleLoggerAdapter implements ILogger {
	readonly #pretty: boolean;

	constructor({ pretty = false }: Options = {}) {
		this.#pretty = pretty;
	}

	write({ level, message, meta }: LogEntry): void {
		if (!this.#pretty) {
			console[level](message, ...(meta ? [meta] : []));
			return;
		}
		const style = LEVEL_STYLES[level];
		const line = `%c${level.toUpperCase().padEnd(5)}%c ${message}`;
		if (meta && Object.keys(meta).length > 0) {
			console.group(line, style.badge, style.text);
			console.dir(meta, { depth: Infinity, colors: true });
			console.groupEnd();
			return;
		}
		console[level](line, style.badge, style.text);
	}
}
