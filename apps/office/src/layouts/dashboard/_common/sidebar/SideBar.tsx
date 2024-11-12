import type { NavData } from '@/office/hooks/useNavData';
import { selectIsOpenNav, selectSetIsOpenNav, selectSidebar } from '@/office/lib/zustand/features/settings.slice';
import { useMainStore } from '@/office/lib/zustand/store';
import useResponsive from '@/ui-react/hooks/useResponsive';

import NavMini from './NavMini';
import NavVertical from './NavVertical';

const SideBar = ({ navData }: { navData: NavData }) => {
	const sidebar = useMainStore(selectSidebar);
	const isOpenNav = useMainStore(selectIsOpenNav);
	const setIsOpenNav = useMainStore(selectSetIsOpenNav);
	const lgUp = useResponsive('up', 'lg');

	const isMini = sidebar === 'mini';

	const onCloseNav = () => {
		setIsOpenNav(false);
	};

	const renderNavMini = <NavMini navData={navData} />;
	const renderNavVertical = <NavVertical openNav={isOpenNav} onCloseNav={onCloseNav} navData={navData} />;

	if (isMini) {
		return lgUp ? renderNavMini : renderNavVertical;
	}

	return renderNavVertical;
};

export default SideBar;
