export default class CloudQuery<T extends Parse.Object = Parse.Object<Parse.Attributes>> extends Parse.Query<T> {
	// eslint-disable-next-line @typescript-eslint/no-useless-constructor, @typescript-eslint/no-explicit-any
	constructor(className: string | (new (...args: any[]) => T | Parse.Object<T>)) {
		super(className);
	}

	find(options?: Parse.Query.FindOptions): Promise<T[]> {
		return super.find({ ...options, context: { ...options?.context, fromCloud: true } });
	}

	findAll(options?: Parse.Query.BatchOptions): Promise<T[]> {
		return super.findAll({ ...options, context: { ...options?.context, fromCloud: true } });
	}
}
