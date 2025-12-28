import IconButton, { type IconButtonProps } from '@mui/material/IconButton';

import { Iconify } from '#app/components/iconify/iconify.tsx';

// ----------------------------------------------------------------------

export type SidebarToggleButtonProps = IconButtonProps & {
	isNavMini?: boolean;
};

export const SidebarToggleButton = ({
	isNavMini: _isNavMini,
	sx,
	...other
}: SidebarToggleButtonProps) => {
	return (
		<IconButton
			size="small"
			sx={[
				(theme) => ({
					width: 32,
					height: 32,
					color: 'text.secondary',
					'&:hover': {
						color: 'text.primary',
						bgcolor: theme.vars.palette.action.hover,
					},
				}),
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<Iconify
				width={20}
				icon="solar:sidebar-minimalistic-outline"
				sx={{ '& path': { strokeWidth: 1.5 } }}
				// ==========================
				// icon="lucide:sidebar"
				// sx={{ '& g': { strokeWidth: 1.75 } }}
			/>
		</IconButton>
	);
};
