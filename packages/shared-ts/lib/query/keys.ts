type QueryAccessor<T> = (root: T) => unknown;

export function getQueryKey<T>(fn: QueryAccessor<T>): string {
	const path: (string | number)[] = [];

	const proxy: unknown = new Proxy(() => {}, {
		get(_target, prop) {
			path.push(String(prop));
			return proxy;
		},
		apply(_target, _thisArg, args) {
			path.push(
				...args.map((arg) =>
					typeof arg === 'string' || typeof arg === 'number'
						? arg
						: JSON.stringify(arg),
				),
			);
			return proxy;
		},
	});

	fn(proxy as T);
	return path.join('.');
}
