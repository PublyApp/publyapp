import type { ReactNode } from 'react';

import { Outlet } from 'react-router-dom';

import { useNavData } from '@/office/hooks/useNavData';
import useBoolean from '@/ui-react/hooks/useBoolean';

import DashboardLayout from '../_common/DashBoardLayout';
import NavMini from '../_common/NavMini';
import NavVertical from '../_common/NavVertical';

type Props = {
	children?: ReactNode;
};

const StaffDashLayout = ({ children }: Props) => {
	const nav = useBoolean();

	const navData = useNavData();

	const renderNavMini = <NavMini navData={navData} />;
	const renderNavVertical = <NavVertical openNav={nav.value} onCloseNav={nav.setFalse} navData={navData} />;

	return (
		<DashboardLayout renderNavMini={renderNavMini} renderNavVertical={renderNavVertical} onOpenNav={nav.setTrue}>
			{children ?? <Outlet />}
		</DashboardLayout>
	);
};

export default StaffDashLayout;
