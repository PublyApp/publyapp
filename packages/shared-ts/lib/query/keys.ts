export type QueryAccessor<T> = (root: T) => unknown;

const stringifyQueryArg = (arg: unknown): string => {
	if (arg === undefined) {
		return 'undefined';
	}

	if (arg === null) {
		return 'null';
	}

	if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
		return String(arg);
	}

	if (typeof arg === 'function') {
		return '[function]';
	}

	if (typeof arg === 'symbol') {
		return `[symbol:${arg.description ?? 'anonymous'}]`;
	}

	if (arg instanceof Date) {
		return arg.toISOString();
	}

	if (Array.isArray(arg)) {
		return `[${arg.map(stringifyQueryArg).join(',')}]`;
	}

	if (typeof arg === 'object') {
		const keys = Object.keys(arg as Record<string, unknown>).sort();
		return `{${keys.map((key) => `${key}:${stringifyQueryArg((arg as Record<string, unknown>)[key])}`).join(',')}}`;
	}

	return String(arg);
};

export function getQueryKey<T>(fn: QueryAccessor<T>): string[] {
	const path: string[] = [];

	const proxy: unknown = new Proxy(() => {}, {
		get(_target, prop) {
			path.push(String(prop));
			return proxy;
		},
	apply(_target, _thisArg, args) {
			path.push(...args.map((arg) => stringifyQueryArg(arg)));
			return proxy;
		},
	});

	fn(proxy as T);
	return path;
}
