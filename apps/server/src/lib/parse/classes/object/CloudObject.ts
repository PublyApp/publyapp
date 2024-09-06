import type { Attributes } from 'parse';

// import { className as appClassName } from '@/shared/lib/constants';

export default class CloudObject<T extends Attributes = Attributes> extends Parse.Object<T> {
	// constructor() {
	// 	const { className, tenantId, attributes } = props;
	// 	super(className, attributes as never);
	// 	const tenant = new Parse.Object(appClassName.TENANT);
	// 	tenant.id = tenantId;
	// 	this.set('tenant' as never, tenant as never);
	// }

	// set<K extends Extract<keyof T, string>>(
	// 	key: K,
	// 	value: T[K] extends undefined ? never : T[K],
	// 	options?: Parse.Object.SetOptions,
	// ): this | false {
	// 	if (key === 'tenant') {
	// 		throw new Error('RESET OF TENANT KEY IS FORBIDDEN');
	// 	}

	// 	return super.set(key, value, options);
	// }

	save<K extends Extract<keyof T, string>>(
		attrs?: Pick<T, K> | T | null,
		options?: Parse.Object.SaveOptions,
	): Promise<this> {
		return super.save(attrs, options);
	}
}
