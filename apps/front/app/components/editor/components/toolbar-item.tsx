import ButtonBase from '@mui/material/ButtonBase';
import { styled } from '@mui/material/styles';
import SvgIcon from '@mui/material/SvgIcon';

import type { EditorToolbarItemProps } from '../types';

// ----------------------------------------------------------------------

export const ToolbarItem = ({ sx, icon, label, active, disabled, ...other }: EditorToolbarItemProps) => {
	return (
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		<ItemRoot active={active} disabled={disabled} sx={sx} {...other}>
			{icon && <SvgIcon sx={{ fontSize: 18 }}>{icon}</SvgIcon>}
			{label && label}
		</ItemRoot>
	);
};

// ----------------------------------------------------------------------

const ItemRoot = styled(ButtonBase, {
	shouldForwardProp: (prop: string) => {
		return !['active', 'disabled', 'sx'].includes(prop);
	},
})<Pick<EditorToolbarItemProps, 'active' | 'disabled'>>(({ theme }) => {
	return {
		...theme.typography.body2,
		width: 28,
		height: 28,
		padding: theme.spacing(0, 0.75),
		borderRadius: theme.shape.borderRadius * 0.75,
		'&:hover': {
			backgroundColor: theme.vars.palette.action.hover,
		},
		variants: [
			{
				props: { active: true },
				style: {
					backgroundColor: theme.vars.palette.action.selected,
					border: `solid 1px ${theme.vars.palette.action.hover}`,
				},
			},
			{
				props: { disabled: true },
				style: {
					opacity: 0.48,
					pointerEvents: 'none',
					cursor: 'not-allowed',
				},
			},
		],
	};
});
