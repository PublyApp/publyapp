import IconButton, { type IconButtonProps } from '@mui/material/IconButton';

import { Iconify } from '@/front/components/iconify/iconify';

// ----------------------------------------------------------------------

export const MenuButton = ({ sx, ...other }: IconButtonProps) => {
	return (
		<IconButton sx={sx} {...other}>
			<Iconify icon="custom:menu-duotone" width={24} />
		</IconButton>
	);
};
