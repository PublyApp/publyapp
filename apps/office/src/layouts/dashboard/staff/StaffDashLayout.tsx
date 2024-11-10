import type { ReactNode } from 'react';

import { Outlet } from 'react-router-dom';

import { useNavData } from '@/office/hooks/useNavData';

import DashboardLayout from '../_common/DashBoardLayout';
import SideBar from '../_common/sidebar/SideBar';

type Props = {
	children?: ReactNode;
};

const StaffDashLayout = ({ children }: Props) => {
	const navData = useNavData({ part: 'staff' });

	const renderSideBar = <SideBar navData={navData} />;

	return <DashboardLayout sidebarSlot={renderSideBar}>{children ?? <Outlet />}</DashboardLayout>;
};

export default StaffDashLayout;
