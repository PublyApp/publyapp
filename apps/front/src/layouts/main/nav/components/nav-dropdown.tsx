import Fade, { type FadeProps } from '@mui/material/Fade';
import { styled } from '@mui/material/styles';
import _ from 'lodash';

// ----------------------------------------------------------------------

const NavDropdownPaper = styled('div')(({ theme }) => {
	return {
		...theme.mixins.paperStyles(theme, { dropdown: true }),
		padding: theme.spacing(5, 1, 1, 4),
		borderRadius: _.toNumber(theme.shape.borderRadius) * 2,
		...(theme.direction === 'rtl' && {
			padding: theme.spacing(5, 4, 1, 1),
		}),
	};
});

// ----------------------------------------------------------------------

type NavDropdownProps = React.ComponentProps<'div'> & {
	open: FadeProps['in'];
};

export const NavDropdown = styled(
	({ open, children, ...other }: NavDropdownProps) => {
		return (
			<Fade in={open}>
				<div {...other}>
					<NavDropdownPaper>{children}</NavDropdownPaper>
				</div>
			</Fade>
		);
	},
)(({ theme }) => {
	return {
		left: 0,
		right: 0,
		marginTop: 12,
		width: '100%',
		position: 'fixed',
		marginLeft: 'auto',
		marginRight: 'auto',
		padding: theme.spacing(1.5),
		zIndex: theme.zIndex.drawer * 2,
		maxWidth: theme.breakpoints.values.lg,
		top: 'calc(var(--layout-header-desktop-height) / 2)',
	};
});
