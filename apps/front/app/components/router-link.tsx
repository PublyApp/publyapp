import { Link, type LinkProps } from 'react-router';

// ----------------------------------------------------------------------

interface RouterLinkProps extends Omit<LinkProps, 'to'> {
	href: string;
	ref?: React.RefObject<HTMLAnchorElement | null>;
}

export const RouterLink = ({ href, ref, ...other }: RouterLinkProps) => {
	return <Link ref={ref} to={href} {...other} />;
};
