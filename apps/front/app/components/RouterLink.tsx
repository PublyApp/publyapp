import { forwardRef } from 'react';

import { Link, useLocation, type LinkProps } from '@remix-run/react';

import { appLocales } from '@/shared/lib/i18n/resources';
import { urlStartWithProtocol } from '@/shared/utils/any.utils';
import useResponsive from '@/ui-react/hooks/useResponsive';
import useTranslate from '@/ui-react/hooks/useTranslate';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
	href: string;
	preserveQuery?: boolean;
	disableAddLocaleToPath?: boolean;
}

const RouterLink = forwardRef<HTMLAnchorElement, RouterLinkProps>(
	({ href: _href, preserveQuery = false, disableAddLocaleToPath = false, ...other }, ref) => {
		const { search, pathname } = useLocation();
		const isTabletAndMobile = useResponsive('down', 'md');
		const { locale: clientLocale } = useTranslate();

		const isExternal = urlStartWithProtocol(_href);
		const pathLocale = appLocales.find((iLocale) => {
			return pathname.startsWith(`/${iLocale}`);
		});

		let href = _href;

		if (!disableAddLocaleToPath && !isExternal && pathLocale) {
			href = `/${clientLocale}${_href}`;
		}

		return (
			<Link
				ref={ref}
				prefetch={isTabletAndMobile ? 'viewport' : 'intent'}
				to={`${href}${preserveQuery ? search : ''}`}
				{...other}
			/>
		);

		// const [searchParams] = useSearchParams();
		// const search = `?${decodeURIComponent(searchParams.toString())}`;
		// console.log('###', search);

		// const pathname = usePathname();

		// const url = useMemo(() => {
		// 	if (!href.startsWith('http://') || !href.startsWith('https://')) {
		// 		return new URL(window.location.origin + href);
		// 	}

		// 	return new URL(href);
		// }, [href]);

		// if (url.pathname === pathname) {
		// 	if (!url.search) {
		// 		return <Link ref={ref} to={href + search} {...other} />;
		// 	}

		// 	return <Link ref={ref} to={href} {...other} />;
		// }

		// if (!withQuery) {
		// 	return <Link ref={ref} to={href} {...other} />;
		// }
	},
);

export default RouterLink;
