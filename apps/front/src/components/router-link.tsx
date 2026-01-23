import _ from 'lodash';
import { useEffect, useState } from 'react';
import { Link, type LinkProps, type To } from 'react-router';

import {
	LANGUAGE_DETECTION_METHOD,
	LANGUAGE_DETECTION_METHOD_ENUM,
	queryParamKey,
} from '@/shared/lib/constants';

import { useTranslate } from '../hooks/use-translate';
import { env } from '../lib/env';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
	href: To;
	ref?: React.RefObject<HTMLAnchorElement | null>;
}

const viteUrl = new URL(env.VITE_ASP_SERVER_URL);
if (import.meta.env.DEV) {
	viteUrl.port = '5050'; // ! vite port: remember to change if you change port in vite.config.ts
}
const viteOrigin = viteUrl.origin;

const checkIsExternalUrl = (to: To, clientOrigin?: string): to is string => {
	if (_.isObject(to)) {
		return false;
	}

	let url: URL | undefined;

	try {
		url = new URL(to);
	} catch (_e) {}

	if (!url) {
		return false;
	}

	const origin = clientOrigin || viteOrigin;
	if (origin === url.origin) {
		return true;
	}

	return false;
};

const RouterLink_A = ({ href, ref, ...other }: RouterLinkProps) => {
	const [clientOrigin, setClientOrigin] = useState<string | undefined>();
	const { currentLang } = useTranslate();

	useEffect(() => {
		setClientOrigin(window.location.origin);
	}, []);

	const isExternalUrl = checkIsExternalUrl(href, clientOrigin);

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
			} catch (_e) {}

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

const RouterLink_B = ({ href, ref, ...other }: RouterLinkProps) => {
	return <Link ref={ref} to={href} {...other} />;
};

export const RouterLink =
	LANGUAGE_DETECTION_METHOD === LANGUAGE_DETECTION_METHOD_ENUM.QUERY_PARAM
		? RouterLink_A
		: RouterLink_B;
