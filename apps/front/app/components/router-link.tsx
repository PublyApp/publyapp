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
	viteUrl.port = '6181'; // ! vite port: remember to change if you change port in vite.config.ts
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

			to = {
				pathname: href.pathname,
				search: decodeURIComponent(searchParams.toString()),
				hash: href.hash,
			};
		} else {
			let url: URL | undefined;

			try {
				url = new URL(href);
			} catch (e) {}

			if (!url) {
				const [pathname, search] = _.split(href, '?');
				const searchParams = new URLSearchParams(search);
				searchParams.set(queryParamKey.language, currentLang.value);
				const searchString = searchParams.toString();
				to = pathname + (searchString ? `?${searchString}` : '');
			} else {
				url.searchParams.set(queryParamKey.language, currentLang.value);
				to = decodeURIComponent(url.toString());
			}
		}
	}

	return <Link ref={ref} to={to} {...other} />;
};
