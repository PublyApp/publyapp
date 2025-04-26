import _ from 'lodash';
import { Link, type LinkProps, type To } from 'react-router';
import { useTranslate } from '../hooks/use-translate';
import { queryParamKey } from '@/shared/lib/constants';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
	href: To;
	ref?: React.RefObject<HTMLAnchorElement | null>;
}

const checkIsExternalUrl = (to: To): to is string => {
	if (_.isObject(to)) {
		return false;
	}

	// let hasProtocol = false;
	let url: URL | undefined;

	try {
		url = new URL(to);
		// hasProtocol = true;
	} catch (e) {}
	// const hasProtocol = ['http://', 'https://'].some((protocol) => {
	// 	return _.startsWith(to, protocol);
	// });

	if (!url) {
		return false;
	}

	if (window.location.origin === url.origin) {
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
				hash: href.hash,
				search: searchParams.toString(),
			};
		} else {
			let url: URL | undefined;

			try {
				url = new URL(href);
			} catch (e) {}

			if (!url) {
				const [pathname, search] = _.split(href, '?');
				url = new URL(window.location.origin);
				url.pathname = pathname;
				url.search = search || '';
			}

			url.searchParams.set(queryParamKey.language, currentLang.value);

			to = {
				pathname: url.pathname,
				search: url.search,
			};
		}
	}

	return <Link ref={ref} to={to} {...other} />;
};
