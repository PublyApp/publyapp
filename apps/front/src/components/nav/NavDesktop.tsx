import { Stack } from '@mui/material';

import NavList from './NavListDesktop';
import { NavProps } from './types';

// ----------------------------------------------------------------------

const NavDesktop = ({ data, sx }: NavProps) => {
	return (
		<Stack
			component="nav"
			direction="row"
			spacing={6}
			sx={{
				ml: 6,
				height: 1,
				...sx,
			}}
		>
			{data.map((link) => {
				return <NavList key={link.title} item={link} />;
			})}
		</Stack>
	);
};

export default NavDesktop;
