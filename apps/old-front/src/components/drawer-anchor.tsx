import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import { varAlpha } from 'minimal-shared/utils';

// Polymorphic type that extends IconButtonProps and allows component prop
type DrawerAnchorProps<T extends React.ElementType = 'button'> = Omit<
	IconButtonProps<T>,
	'component'
> & {
	component?: T;
};

const DrawerAnchor = <T extends React.ElementType = 'button'>({
	onClick,
	sx,
	component,
	children,
	...other
}: DrawerAnchorProps<T>) => {
	return (
		<IconButton
			component={component}
			onClick={onClick}
			sx={[
				(theme) => {
					return {
						p: 0.5,
						position: 'absolute',
						color: 'action.active',
						bgcolor: 'background.paper',
						transform: 'translate(-50%, -50%)',
						zIndex: 'var(--layout-nav-zIndex)',
						top: 'calc(var(--layout-header-desktop-height) / 2)',
						border: `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
						transition: theme.transitions.create(['left'], {
							easing: 'var(--layout-transition-easing)',
							duration: 'var(--layout-transition-duration)',
						}),
						'&:hover': {
							color: 'text.primary',
							bgcolor: 'background.neutral',
						},
						boxShadow: theme.shadows[24],
						borderRadius: 1,
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			{children}
		</IconButton>
	);
};

export default DrawerAnchor;
