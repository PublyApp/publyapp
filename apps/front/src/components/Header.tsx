import { AppBar /*  Button, */, Box, Container, Link, Stack, Toolbar, useTheme } from '@mui/material';

import useOffsetTop from '@aktiveo/ui-react/hooks/useOffsetTop';
import useResponsive from '@aktiveo/ui-react/hooks/useResponsive';

import { HEADER } from '../utils/constants';
import { bgBlur } from '../utils/cssUtils';
import { navConfig } from '../utils/temp';

import Label from './Label';
import Logo from './Logo';
import NavDesktop from './nav/NavDesktop';

const Header = () => {
	const theme = useTheme();
	const isOffset = useOffsetTop();
	const isMdUp = useResponsive('up', 'md');

	return (
		<AppBar color="transparent" sx={{ boxShadow: 'none' }}>
			<Toolbar
				disableGutters
				sx={{
					height: {
						xs: HEADER.H_MOBILE,
						md: HEADER.H_MAIN_DESKTOP,
					},
					transition: theme.transitions.create(['height', 'background-color'], {
						easing: theme.transitions.easing.easeInOut,
						duration: theme.transitions.duration.shorter,
					}),
					// ...(headerOnDark && {
					// 	color: 'common.white',
					// }),
					...(isOffset && {
						...bgBlur({ color: theme.palette.background.default }),
						color: 'text.primary',
						height: {
							md: HEADER.H_MAIN_DESKTOP - 16,
						},
					}),
				}}
			>
				<Container sx={{ height: 1, display: 'flex', alignItems: 'center' }}>
					<Box sx={{ lineHeight: 0, position: 'relative' }}>
						<Logo />

						<Link href="https://zone-docs.vercel.app/changelog" target="_blank" rel="noopener">
							<Label
								color="info"
								sx={{
									ml: 0.5,
									px: 0.5,
									top: -14,
									left: 60,
									height: 20,
									fontSize: 11,
									cursor: 'pointer',
									position: 'absolute',
								}}
							>
								v2.0
							</Label>
						</Link>
					</Box>

					{isMdUp && <NavDesktop data={navConfig} />}

					<Stack spacing={2} flexGrow={1} direction="row" alignItems="center" justifyContent="flex-end">
						<Stack spacing={1} direction="row" alignItems="center">
							{/* <Searchbar />

							<SettingsDrawer /> */}
						</Stack>

						{/* {isMdUp && (
							<Button variant="contained" color="inherit" href={paths.zoneStore} target="_blank" rel="noopener">
								Buy Now
							</Button>
						)} */}
					</Stack>

					{/* {!isMdUp && <NavMobile data={navConfig} />} */}
				</Container>
			</Toolbar>

			{/* {isOffset && <HeaderShadow />} */}
		</AppBar>
	);
};

export default Header;
