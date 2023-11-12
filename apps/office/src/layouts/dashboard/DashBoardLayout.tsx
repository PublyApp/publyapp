// @mui
import Box from '@mui/material/Box';

import useBoolean from '@devist/ui-react/hooks/useBoolean';
import useResponsive from '@devist/ui-react/hooks/useResponsive';

import Header from './Header';
import Main from './Main';
import NavMini from './NavMini';
import NavVertical from './NavVertical';

// ----------------------------------------------------------------------

type Props = {
	children: React.ReactNode;
};

const DashboardLayout = ({ children }: Props) => {
	// const [searchParams] = useSearchParams();

	// const settings = useSettingsContext();

	const lgUp = useResponsive('up', 'lg');

	const nav = useBoolean();

	// const isHorizontal = settings.themeLayout === 'horizontal';

	const isMini = /* settings.themeLayout === 'mini' */ false;

	const renderNavMini = <NavMini />;

	// const renderHorizontal = <NavHorizontal />;

	const renderNavVertical = <NavVertical openNav={nav.value} onCloseNav={nav.setFalse} />;

	// if (isHorizontal) {
	// 	return (
	// 		<>
	// 			<Header onOpenNav={nav.onTrue} />

	// 			{lgUp ? renderHorizontal : renderNavVertical}

	// 			<Main>{children}</Main>
	// 		</>
	// 	);
	// }

	if (isMini) {
		return (
			<>
				<Header onOpenNav={nav.setTrue} />

				<Box
					sx={{
						minHeight: 1,
						display: 'flex',
						flexDirection: { xs: 'column', lg: 'row' },
					}}
				>
					{lgUp ? renderNavMini : renderNavVertical}

					<Main>{children}</Main>
				</Box>
			</>
		);
	}

	return (
		<>
			<Header onOpenNav={nav.setTrue} />

			<Box
				sx={{
					minHeight: 1,
					display: 'flex',
					flexDirection: { xs: 'column', lg: 'row' },
				}}
			>
				{renderNavVertical}

				<Main>{children}</Main>
			</Box>
		</>
	);
};

export default DashboardLayout;
