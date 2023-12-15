import { ListItemButton } from '@mui/material';
import { alpha, styled } from '@mui/material/styles';

import { NAV } from '@/front/lib/constants';

import { type NavItemProps } from '../types';

// ----------------------------------------------------------------------

type StyledNavItemProps = Omit<NavItemProps, 'item'>;

export const StyledNavItem = styled(ListItemButton, {
	shouldForwardProp: (prop) => {
		return prop !== 'active';
	},
})<StyledNavItemProps>(({ active, theme }) => {
	return {
		...theme.typography.body2,
		color: theme.palette.text.secondary,
		height: NAV.H_ITEM,
		// Active
		...(active && {
			color: theme.palette.primary.main,
			...theme.typography.subtitle2,
			backgroundColor: alpha(theme.palette.primary.main, theme.palette.action.selectedOpacity),
		}),
	};
});
