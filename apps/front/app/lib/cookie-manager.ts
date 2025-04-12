import _ from 'lodash';

import { isServer } from '@tanstack/react-query';

export class CookieManager {
	source?: Headers;

	private useBrowserCookies: boolean;

	constructor(source?: Headers) {
		this.source = source;

		if (isServer && !this.source) {
			this.source = new Headers();
		}

		this.useBrowserCookies = !isServer && !this.source;
	}

	get(name: string) {
		let strCookie: string | null;

		if (this.useBrowserCookies) {
			strCookie = document.cookie;
		} else {
			if (!this.source) {
				this.source = new Headers();
			}

			strCookie = this.source.get('Set-Cookie');
		}

		const cookies = strCookie?.split(';') ?? [];

		// Loop through the cookies to find the one with the specified name
		for (const cookie of cookies) {
			// Trim any leading or trailing whitespace
			const [cookieName, cookieValue] = cookie.trim().split('=');

			// If the cookie name matches, return its value
			if (cookieName === name) {
				return decodeURIComponent(cookieValue);
			}
		}

		// Return null if the cookie is not found
		return undefined;
	}

	set(
		name: string,
		value: string,
		// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
		options?: Record<string, any> & {
			expires?: Date;
			maxAge?: number;
			secure?: boolean;
			sameSite?: 'Strict' | 'Lax' | 'None';
		},
	) {
		let cookie = `${name}=${value}`;

		// Add optional attributes
		if (options?.path) cookie += `; path=${options.path}`;
		if (options?.domain) cookie += `; domain=${options.domain}`;
		if (options?.expires) cookie += `; expires=${options.expires}`;
		if (options?.maxAge) cookie += `; max-age=${options.maxAge}`;
		if (options?.secure !== false) cookie += '; secure';
		if (options?.sameSite) cookie += `; samesite=${options.sameSite}`;

		if (this.useBrowserCookies) {
			document.cookie = cookie;
		} else {
			if (!this.source) {
				this.source = new Headers();
			}

			this.source.append('Set-Cookie', cookie);
		}
	}

	delete(name: string) {
		const cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;

		if (this.useBrowserCookies) {
			document.cookie = cookie;
		} else {
			if (!this.source) {
				this.source = new Headers();
			}

			this.source.append('Set-Cookie', cookie);
		}
	}
}
