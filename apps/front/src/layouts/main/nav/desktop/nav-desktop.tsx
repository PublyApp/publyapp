import { Nav, NavUl } from '../components';
import type { NavMainProps } from '../types';
import { NavList } from './nav-desktop-list';

// ----------------------------------------------------------------------

export const NavDesktop = ({ data, sx, ...other }: NavMainProps) => {
	return (
		<Nav
			sx={[
				() => {
					return {
						/* Put styles */
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<NavUl
				sx={{
					gap: 5,
					height: 1,
					flexDirection: 'row',
					alignItems: 'center',
				}}
			>
				{data.map((list) => {
					return <NavList key={list.title} data={list} />;
				})}
			</NavUl>
		</Nav>
	);
};
