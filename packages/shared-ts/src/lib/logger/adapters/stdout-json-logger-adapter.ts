import { nodeProcess } from '../log-level';
import type { ILogger, LogEntry } from '../logger.types';

export type Signal = 'SIGTERM' | 'SIGINT';

/** The process members the adapter needs; injected so tests never signal themselves. */
export type LoggerHooks = {
	on(event: 'beforeExit' | 'exit', listener: () => void): void;
	once(event: Signal, listener: () => void): void;
	listenerCount(event: Signal): number;
	kill(pid: number, signal: Signal): void;
	pid: number;
};

/** One signal handler per target; it flushes every adapter created on that target. */
const adaptersByTarget = new WeakMap<object, Set<{ flush(): void }>>();

const stopAll = (
	hooks: LoggerHooks,
	adapters: Set<{ flush(): void }>,
	signal: Signal,
): void => {
	for (const adapter of adapters) {
		adapter.flush();
	}
	// No application handler: keep Node's default termination, exactly as without us.
	if (hooks.listenerCount(signal) === 0) {
		hooks.kill(hooks.pid, signal);
	}
};

const trackForSignals = (
	hooks: LoggerHooks,
	adapter: { flush(): void },
): void => {
	let adapters = adaptersByTarget.get(hooks);
	if (!adapters) {
		const created = new Set<{ flush(): void }>();
		adaptersByTarget.set(hooks, created);
		hooks.once('SIGTERM', () => stopAll(hooks, created, 'SIGTERM'));
		hooks.once('SIGINT', () => stopAll(hooks, created, 'SIGINT'));
		adapters = created;
	}
	adapters.add(adapter);
};

const defaultOut = (chunk: string): void => {
	nodeProcess?.stdout.write(chunk);
};

/**
 * Production server: one JSON line per event on stdout. Lines wait in a buffer
 * and go out as one batch after the caller yields, so a log call never blocks;
 * `error` entries and process end flush synchronously. SIGTERM/SIGINT flush,
 * then re-raise the signal unless the application owns it, so a stop cannot
 * lose the last lines.
 */
export class StdoutJsonLoggerAdapter implements ILogger {
	readonly #out: (chunk: string) => void;
	readonly #lines: string[] = [];
	#scheduled = false;

	constructor(
		out: (chunk: string) => void = defaultOut,
		hooks: LoggerHooks | null | undefined = nodeProcess,
	) {
		this.#out = out;
		hooks?.on('beforeExit', () => this.flush());
		hooks?.on('exit', () => this.flush());
		if (hooks) {
			trackForSignals(hooks, this);
		}
	}

	write({ level, message, meta, time }: LogEntry): void {
		const fields = { time: time.toISOString(), level, message };
		// fields last: meta cannot spoof time, level or message
		this.#lines.push(JSON.stringify({ ...fields, ...meta, ...fields }));
		if (level === 'error') {
			this.flush();
		} else if (!this.#scheduled) {
			this.#scheduled = true;
			queueMicrotask(() => this.flush());
		}
	}

	flush(): void {
		this.#scheduled = false;
		if (this.#lines.length === 0) {
			return;
		}
		const chunk = `${this.#lines.join('\n')}\n`;
		this.#lines.length = 0;
		this.#out(chunk);
	}
}
