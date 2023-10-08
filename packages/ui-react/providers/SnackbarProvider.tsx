import { useRef } from 'react';

// @mui
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
// @mui
import { alpha, styled } from '@mui/material/styles';
//
import { closeSnackbar, MaterialDesignContent, SnackbarProvider as NotistackProvider } from 'notistack';

import Iconify from '@ui-react/components/Iconify';

//
// import Iconify from '../iconify';
// import { useSettingsContext } from '../settings';

// ----------------------------------------------------------------------

export const StyledNotistack = styled(MaterialDesignContent)(({ theme }) => {
	const isLight = theme.palette.mode === 'light';

	return {
		'& #notistack-snackbar': {
			...theme.typography.subtitle2,
			padding: 0,
			flexGrow: 1,
		},
		'&.notistack-MuiContent': {
			padding: theme.spacing(0.5),
			paddingRight: theme.spacing(2),
			color: theme.palette.text.primary,
			boxShadow: theme.customShadows.z8,
			borderRadius: theme.shape.borderRadius,
			backgroundColor: theme.palette.background.paper,
		},
		'&.notistack-MuiContent-default': {
			padding: theme.spacing(1),
			color: isLight ? theme.palette.common.white : theme.palette.grey[800],
			backgroundColor: isLight ? theme.palette.grey[800] : theme.palette.common.white,
		},
		// '&.notistack-MuiContent-info': {},
		// '&.notistack-MuiContent-success': {},
		// '&.notistack-MuiContent-warning': {},
		// '&.notistack-MuiContent-error': {},
	};
});

// ----------------------------------------------------------------------

type StyledIconProps = {
	color: 'info' | 'success' | 'warning' | 'error';
};

export const StyledIcon = styled('span')<StyledIconProps>(({ color, theme }) => {
	return {
		width: 44,
		height: 44,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: theme.spacing(1.5),
		color: theme.palette[color].main,
		borderRadius: theme.shape.borderRadius,
		backgroundColor: alpha(theme.palette[color].main, 0.16),
	};
});

// ----------------------------------------------------------------------

type Props = {
	children: React.ReactNode;
};

const SnackbarProvider = ({ children }: Props) => {
	// const settings = useSettingsContext();

	const isRTL = /* settings.themeDirection === 'rtl' */ false;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const notistackRef = useRef<any>(null);

	return (
		<NotistackProvider
			ref={notistackRef}
			maxSnack={5}
			preventDuplicate
			autoHideDuration={3000}
			TransitionComponent={isRTL ? Collapse : undefined}
			variant="success" // Set default variant
			anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
			iconVariant={{
				info: (
					<StyledIcon color="info">
						<Iconify icon="eva:info-fill" width={24} />
					</StyledIcon>
				),
				success: (
					<StyledIcon color="success">
						<Iconify icon="eva:checkmark-circle-2-fill" width={24} />
					</StyledIcon>
				),
				warning: (
					<StyledIcon color="warning">
						<Iconify icon="eva:alert-triangle-fill" width={24} />
					</StyledIcon>
				),
				error: (
					<StyledIcon color="error">
						<Iconify icon="solar:danger-bold" width={24} />
					</StyledIcon>
				),
			}}
			Components={{
				default: StyledNotistack,
				info: StyledNotistack,
				success: StyledNotistack,
				warning: StyledNotistack,
				error: StyledNotistack,
			}}
			// with close as default
			action={(snackbarId) => {
				return (
					<IconButton
						size="small"
						onClick={() => {
							return closeSnackbar(snackbarId);
						}}
						sx={{ p: 0.5 }}
					>
						<Iconify width={16} icon="mingcute:close-line" />
					</IconButton>
				);
			}}
		>
			{children}
		</NotistackProvider>
	);
};

export default SnackbarProvider;
