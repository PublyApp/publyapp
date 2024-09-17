import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';

import Logo from '@/office/components/Logo';
import NavSectionMini from '@/office/components/nav-section/nav-mini/NavSectionMini';
import { NAV } from '@/office/lib/constants';
import { hideScroll } from '@/ui-react/utils/css.utils';

import NavToggleButton from '../../_common/NavToggleButton';

// ----------------------------------------------------------------------

type Props = {
	navData: any;
};

const NavMini = ({ navData }: Props) => {
	return (
		<Box
			component="nav"
			sx={{
				flexShrink: { lg: 0 },
				width: { lg: NAV.W_MINI },
			}}
		>
			<NavToggleButton
				sx={{
					top: 22,
					left: NAV.W_MINI - 12,
				}}
			/>

			<Stack
				sx={{
					pb: 2,
					height: 1,
					position: 'fixed',
					width: NAV.W_MINI,
					borderRight: (theme) => {
						return `dashed 1px ${theme.palette.divider}`;
					},
					...hideScroll.x,
				}}
			>
				<Logo sx={{ mx: 'auto', my: 2 }} />

				<NavSectionMini
					data={navData}
					config={{
						// currentRole: user?.role || 'admin',
						currentRole: 'admin',
					}}
				/>
			</Stack>
		</Box>
	);
};

export default NavMini;
