import _ from 'lodash';
import { Link, type LinkProps, type To } from 'react-router';
import { useTranslate } from '../hooks/use-translate';
import { isServer, queryParamKey } from '@/shared/lib/constants';
import { env } from '../lib/env';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
	href: To;
	ref?: React.RefObject<HTMLAnchorElement | null>;
}

const viteUrl = new URL(env.VITE_SERVER_URL);
if (import.meta.env.DEV) {
	viteUrl.port = '6181';
}
const viteOrigin = viteUrl.origin;

const checkIsExternalUrl = (to: To): to is string => {
	if (_.isObject(to)) {
		return false;
	}

	let url: URL | undefined;

	try {
		url = new URL(to);
	} catch (e) {}

	if (!url) {
		return false;
	}

	if ((isServer ? viteOrigin : window.location.origin) === url.origin) {
		return true;
	}

	return false;
};

export const RouterLink = ({ href, ref, ...other }: RouterLinkProps) => {
	const isExternalUrl = checkIsExternalUrl(href);
	const { currentLang } = useTranslate();

	let to = href;

	if (isExternalUrl) {
		// do nothing
	} else {
		if (!_.isString(href)) {
			const searchParams = new URLSearchParams(href.search);
			searchParams.set(queryParamKey.language, currentLang.value);

			let _pathname = href.pathname
				? decodeURIComponent(href.pathname)
				: href.pathname;

			if (_pathname?.includes('#') /*  === '/#' */) {
				// _pathname = undefined;
				_pathname = _pathname?.replaceAll('#', '');
			}

			to = {
				pathname: _pathname,
				hash: href.hash,
				search: decodeURIComponent(searchParams.toString()),
			};
		} else {
			let url: URL | undefined;

			try {
				url = new URL(href);
			} catch (e) {}

			if (!url) {
				const [pathname, search] = _.split(href, '?');
				url = new URL(isServer ? viteOrigin : window.location.origin);
				url.pathname = pathname;
				url.search = search || '';
			}

			url.searchParams.set(queryParamKey.language, currentLang.value);

			let _pathname: string | undefined = url.pathname
				? decodeURIComponent(url.pathname)
				: url.pathname;

			if (_pathname?.includes('#') /*  === '/#' */) {
				// _pathname = undefined;
				_pathname = _pathname?.replaceAll('#', '');
			}

			to = {
				pathname: _pathname,
				search: decodeURIComponent(url.search),
			};
		}
	}

	return <Link ref={ref} to={to} {...other} />;
};
