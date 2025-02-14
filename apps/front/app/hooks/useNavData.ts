import { Store, UserCog, Users } from 'lucide-react';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import type { NavData } from '../components/ui/navigation/AppSidebar';

import useMatchPath from './useMatchPath';

export const useNavData = (): NavData => {
	const matchPath = useMatchPath();

	const navData: NavData = [
		{
			name: 'Tenants',
			href: FRONT_PATH_NAMES.staff.tenants.root,
			icon: Store,
			notifications: false,
			active: matchPath(makePath(FRONT_PATH_NAMES.staff.tenants.root, '*'), true).active,
		},
		{
			name: 'Tenant Users',
			href: FRONT_PATH_NAMES.staff.tenantUsers.root,
			icon: Users,
			notifications: false,
			active: false,
		},
		{
			name: 'Staff Members',
			href: FRONT_PATH_NAMES.staff.staffMembers.root,
			icon: UserCog,
			notifications: false,
			active: false,
		},
	];

	return navData;
};
