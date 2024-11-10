import AppBar from '@mui/material/AppBar';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';

import SvgColor from '@/office/components/SvgColor';
import { HEADER, NAV } from '@/office/lib/constants';
import { selectSetIsOpenNav, selectSidebar } from '@/office/lib/zustand/features/settings.slice';
import { useMainStore } from '@/office/lib/zustand/store';
import useResponsive from '@/ui-react/hooks/useResponsive';
import { bgBlur } from '@/ui-react/utils/css.utils';

import LanguagePopover from '../../_common/LanguagePopover';
import SearchBar from '../../_common/SearchBar';

const Header = () => {
	const theme = useTheme();
	const sidebar = useMainStore(selectSidebar);
	const setIsOpenNav = useMainStore(selectSetIsOpenNav);

	const onOpenNav = () => {
		setIsOpenNav(true);
	};

	const isNavMini = sidebar === 'mini';

	const lgUp = useResponsive('up', 'lg');

	const renderContent = (
		<>
			{!lgUp && (
				<IconButton onClick={onOpenNav}>
					<SvgColor src="/assets/icons/navbar/ic_menu_item.svg" />
				</IconButton>
			)}

			<SearchBar />

			<Stack flexGrow={1} direction="row" alignItems="center" justifyContent="flex-end" spacing={{ xs: 0.5, sm: 1 }}>
				<LanguagePopover />

				{/* <NotificationsPopover /> */}

				{/* <ContactsPopover /> */}

				{/* <SettingsButton /> */}

				{/* <AccountPopover /> */}
			</Stack>
		</>
	);

	return (
		<AppBar
			sx={{
				height: HEADER.H_MOBILE,
				zIndex: theme.zIndex.appBar + 1,
				...bgBlur({
					color: theme.palette.background.default,
				}),
				transition: theme.transitions.create(['height'], {
					duration: theme.transitions.duration.shorter,
				}),
				...(lgUp && {
					width: `calc(100% - ${NAV.W_VERTICAL + 1}px)`,
					height: HEADER.H_DESKTOP,
					// ...(offsetTop && {
					// 	height: HEADER.H_DESKTOP_OFFSET,
					// }),
					// ...(isNavHorizontal && {
					// 	width: 1,
					// 	bgcolor: 'background.default',
					// 	height: HEADER.H_DESKTOP_OFFSET,
					// 	borderBottom: `dashed 1px ${theme.palette.divider}`,
					// }),
					...(isNavMini
						? {
								width: `calc(100% - ${NAV.W_MINI + 1}px)`,
							}
						: {}),
				}),
			}}
		>
			<Toolbar
				sx={{
					height: 1,
					px: { lg: 5 },
				}}
			>
				{/* {t('hello')} */}
				{renderContent}
			</Toolbar>
		</AppBar>
	);
};

export default Header;
