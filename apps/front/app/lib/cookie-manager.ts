import _ from 'lodash';

export class CookieManager {
	private __internalMap: Map<string, string>;

	constructor(rawCookies: string) {
		this.__internalMap = new Map<string, string>();
		this.parse(rawCookies);
	}

	private parse(rawCookies: string) {
		const cookieParts = rawCookies.split(';').filter(Boolean);

		cookieParts.forEach((part) => {
			const [key, value] = _.trim(part).split('=');
			this.set(key, value);
		});
	}

	static parse(rawCookies: string) {
		const cookieManager = new CookieManager(rawCookies);
		return cookieManager.__internalMap;
	}

	set(key: string, value: string) {
		this.__internalMap.set(key, value);
	}

	get(key: string) {
		return this.__internalMap.get(key);
	}

	serialize() {
		return Array.from(this.__internalMap.entries())
			.map(([key, value]) => {
				return `${key}=${value}`;
			})
			.join('; ');
	}
}
