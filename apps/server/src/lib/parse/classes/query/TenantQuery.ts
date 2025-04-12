import { className as appClassName } from "@/shared/lib/constants";

import CloudQuery from "./CloudQuery";

export default class TenantQuery<
	T extends Parse.Object = Parse.Object<Parse.Attributes>,
> extends CloudQuery<T> {
	constructor({
		className,
		tenantId,
	}: {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		className: string | (new (...args: any[]) => T | Parse.Object<T>);
		tenantId: string;
	}) {
		super(className);
		const tenant = new Parse.Object(appClassName.TENANT);
		tenant.id = tenantId;
		this.equalTo("tenant", tenant as never);
	}
}
