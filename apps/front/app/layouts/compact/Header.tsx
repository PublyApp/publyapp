import { AppBar, Link, Stack, Toolbar, useTheme } from '@mui/material';
import { Link as RouterLink } from '@remix-run/react';

import Logo from '@/front/components/Logo';
import { HEADER } from '@/front/lib/constants';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { bgBlur } from '@/ui-react/utils/css.utils';

import HeaderShadow from '../_common/HeaderShadow';
import LanguagePopover from '../_common/LanguagePopover';

// ----------------------------------------------------------------------

type Props = {
	isOffset: boolean;
};

const Header = ({ isOffset }: Props) => {
	const theme = useTheme();

	return (
		<AppBar color="transparent" sx={{ boxShadow: 'none' }}>
			<Toolbar
				sx={{
					justifyContent: 'space-between',
					height: {
						xs: HEADER.H_MOBILE,
						md: HEADER.H_MAIN_DESKTOP,
					},
					transition: theme.transitions.create(['height', 'background-color'], {
						easing: theme.transitions.easing.easeInOut,
						duration: theme.transitions.duration.shorter,
					}),
					...(isOffset && {
						...bgBlur({ color: theme.palette.background.default }),
						height: {
							md: HEADER.H_MAIN_DESKTOP - 16,
						},
					}),
				}}
			>
				<Logo />

				<Stack spacing={1} direction="row" alignItems="center">
					<LanguagePopover />

					{/* <SettingsDrawer /> */}

					<Link to={FRONT_PATH_NAMES.support} component={RouterLink} variant="subtitle2" color="inherit">
						Need Help?
					</Link>
				</Stack>
			</Toolbar>

			{isOffset && <HeaderShadow />}
		</AppBar>
	);
};

export default Header;
