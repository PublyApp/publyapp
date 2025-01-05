import _ from 'lodash';

export class CookieManager {
	private __internalMap: Map<string, string>;

	constructor(rawCookies: string) {
		this.__internalMap = new Map<string, string>();
		this._parse(rawCookies);
	}

	private _parse(rawCookies: string) {
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

	// eslint-disable-next-line @typescript-eslint/no-dupe-class-members
	parse() {
		return this.__internalMap;
	}

	set(key: string, value: string) {
		this.__internalMap.set(key, value);
	}

	get(key: string) {
		return this.__internalMap.get(key);
	}

	serialize() {
		const str = Array.from(this.__internalMap.entries())
			.map(([key, value]) => {
				return `${key}=${value}`;
			})
			.join('; ');
		return str;
	}
}
