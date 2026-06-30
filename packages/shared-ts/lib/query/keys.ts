export type QueryAccessor<T> = (root: T) => unknown;

type JsonRecord = Record<string, unknown>;

type StringifySeen = Set<object>;

const stringifyQueryArg = (arg: unknown, seen: StringifySeen): string => {
	if (arg === undefined) {
		return 'undefined';
	}

	if (arg === null) {
		return 'null';
	}

	if (
		typeof arg === 'string' ||
		typeof arg === 'number' ||
		typeof arg === 'boolean' ||
		typeof arg === 'bigint'
	) {
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
		return `[${arg.map((item) => stringifyQueryArg(item, seen)).join(',')}]`;
	}

	if (typeof arg === 'object') {
		if (seen.has(arg)) {
			return '[circular]';
		}

		seen.add(arg);
		const entries: string[] = [];
		for (const key of Object.keys(arg as JsonRecord).sort()) {
			entries.push(
				`${key}:${stringifyQueryArg((arg as JsonRecord)[key], seen)}`,
			);
		}

		for (const symbolKey of Object.getOwnPropertySymbols(arg as object)) {
			entries.push(
				`${String(symbolKey)}:${stringifyQueryArg((arg as { [key: symbol]: unknown })[symbolKey], seen)}`,
			);
		}

		return `{${entries.join(',')}}`;
	}

	return String(arg);
};

const isIgnoredAccessorProperty = (prop: string | symbol): boolean => {
	if (typeof prop === 'symbol') {
		return true;
	}

	return prop === 'then' || prop === 'inspect' || prop === 'toString';
};

export function getQueryKey<T>(fn: QueryAccessor<T>): string[] {
	const path: string[] = [];

	const proxy: unknown = new Proxy(() => {}, {
		get(_target, prop) {
			if (isIgnoredAccessorProperty(prop)) {
				return undefined;
			}

			path.push(String(prop));
			return proxy;
		},
		apply(_target, _thisArg, args) {
			path.push(...args.map((arg) => stringifyQueryArg(arg, new Set<object>())));
			return proxy;
		},
	});

	fn(proxy as T);
	return path;
}
