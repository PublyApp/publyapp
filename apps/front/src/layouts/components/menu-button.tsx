import IconButton, { type IconButtonProps } from '@mui/material/IconButton';

import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

export const MenuButton = ({ sx, ...other }: IconButtonProps) => {
	return (
		<IconButton sx={sx} {...other}>
			<Iconify icon="custom:menu-duotone" width={24} />
		</IconButton>
	);
};
