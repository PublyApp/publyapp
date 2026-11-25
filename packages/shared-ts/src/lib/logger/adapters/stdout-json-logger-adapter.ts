import { nodeProcess } from '../log-level';
import type { ILogger, LogEntry } from '../logger.types';

export type Signal = 'SIGTERM' | 'SIGINT';

/** The process members the adapter needs; injected so tests never signal themselves. */
export type LoggerHooks = {
	once(event: 'beforeExit' | 'exit', listener: () => void): void;
	prependListener(event: Signal, listener: () => void): void;
	off(event: Signal, listener: () => void): void;
	listenerCount(event: Signal): number;
	kill(pid: number, signal: Signal): void;
	pid: number;
};

type Flushable = { flush(): void };

/** One set of hooks per process target, flushing every adapter created on it. */
const adaptersByTarget = new WeakMap<object, Set<Flushable>>();

const flushAll = (adapters: Set<Flushable>): void => {
	for (const adapter of adapters) {
		adapter.flush();
	}
};

const onSignal = (
	hooks: LoggerHooks,
	adapters: Set<Flushable>,
	signal: Signal,
): void => {
	const handler = (): void => {
		flushAll(adapters);
		// Prepended, so every application listener is still registered here, even a
		// `once` one. Only us left: step aside and re-raise, so Node terminates exactly
		// as it would without the logger. Otherwise the application owns the shutdown.
		if (hooks.listenerCount(signal) === 1) {
			hooks.off(signal, handler);
			hooks.kill(hooks.pid, signal);
		}
	};
	hooks.prependListener(signal, handler);
};

const track = (hooks: LoggerHooks, adapter: Flushable): void => {
	let adapters = adaptersByTarget.get(hooks);
	if (!adapters) {
		const created = new Set<Flushable>();
		adaptersByTarget.set(hooks, created);
		hooks.once('beforeExit', () => flushAll(created));
		hooks.once('exit', () => flushAll(created));
		onSignal(hooks, created, 'SIGTERM');
		onSignal(hooks, created, 'SIGINT');
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
		// ponytail: adapters stay referenced for the process life (one logger per process).
		if (hooks) {
			track(hooks, this);
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
