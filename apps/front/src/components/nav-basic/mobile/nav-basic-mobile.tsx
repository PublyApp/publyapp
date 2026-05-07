import { useTheme } from '@mui/material/styles';

import { Nav, NavUl } from '../components/nav-elements';
import { navBasicClasses } from '../styles/classes';
import { navBasicVars } from '../styles/css-vars';
import type { NavBasicProps } from '../types';
import { NavList } from './nav-list';

// ----------------------------------------------------------------------

export const NavBasicMobile = ({
	sx,
	data,
	render,
	slotProps,
	enabledRootRedirect,
	cssVars: overridesVars,
	...other
}: NavBasicProps) => {
	const theme = useTheme();

	const cssVars = { ...navBasicVars.mobile(theme), ...overridesVars };

	return (
		<Nav
			className={navBasicClasses.mobile}
			sx={[{ ...cssVars }, ...(Array.isArray(sx) ? sx : [sx])]}
			{...other}
		>
			<NavUl sx={{ flex: '1 1 auto', gap: 'var(--nav-item-gap)' }}>
				{data.map((list) => {
					return (
						<NavList
							key={list.title}
							depth={1}
							data={list}
							render={render}
							slotProps={slotProps}
							enabledRootRedirect={enabledRootRedirect}
						/>
					);
				})}
			</NavUl>
		</Nav>
	);
};
