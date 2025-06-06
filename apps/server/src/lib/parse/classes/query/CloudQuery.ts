export default class CloudQuery<
	T extends Parse.Object = Parse.Object<Parse.Attributes>,
> extends Parse.Query<T> {
	// // biome-ignore lint/complexity/noUselessConstructor: safe to use constructor here
	// constructor(
	// 	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
	// 	className: string | (new (...args: any[]) => T | Parse.Object<T>),
	// ) {
	// 	super(className);
	// }

	find(options?: Parse.Query.FindOptions): Promise<T[]> {
		return super.find({
			...options,
			context: { ...options?.context, fromCloud: true },
		});
	}

	findAll(options?: Parse.Query.BatchOptions): Promise<T[]> {
		return super.findAll({
			...options,
			context: { ...options?.context, fromCloud: true },
		});
	}
}
