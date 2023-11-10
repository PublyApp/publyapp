// @mui
import IconButton, { type IconButtonProps } from '@mui/material/IconButton';
import { useTheme } from '@mui/material/styles';

import { NAV } from '@office/lib/constants';
import Iconify from '@ui-react/components/Iconify';
import useResponsive from '@ui-react/hooks/useResponsive';
import { bgBlur } from '@ui-react/utils/css.utils';

// hooks
// import { useResponsive } from 'src/hooks/use-responsive';
// theme
// import { bgBlur } from 'src/theme/css';
// components
// import Iconify from 'src/components/iconify';
// import { useSettingsContext } from 'src/components/settings';
//
// import { NAV } from '../config-layout';

// ----------------------------------------------------------------------

const NavToggleButton = ({ sx, ...other }: IconButtonProps) => {
	const theme = useTheme();

	// const settings = useSettingsContext();

	const lgUp = useResponsive('up', 'lg');

	if (!lgUp) {
		return null;
	}

	return (
		<IconButton
			size="small"
			onClick={() => {
				// return settings.onUpdate('themeLayout', settings.themeLayout === 'vertical' ? 'mini' : 'vertical');
			}}
			sx={{
				p: 0.5,
				top: 32,
				position: 'fixed',
				left: NAV.W_VERTICAL - 12,
				zIndex: theme.zIndex.appBar + 1,
				border: `dashed 1px ${theme.palette.divider}`,
				...bgBlur({ opacity: 0.48, color: theme.palette.background.default }),
				'&:hover': {
					bgcolor: 'background.default',
				},
				...sx,
			}}
			{...other}
		>
			<Iconify
				width={16}
				// icon={settings.themeLayout === 'vertical' ? 'eva:arrow-ios-back-fill' : 'eva:arrow-ios-forward-fill'}
				icon="eva:arrow-ios-back-fill"
			/>
		</IconButton>
	);
};

export default NavToggleButton;
