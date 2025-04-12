import { useEffect } from 'react';

import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import { mergeClasses } from 'minimal-shared/utils';

import { Logo } from '@/front/components/logo';
import {
	NavSectionVertical,
	type NavSectionProps,
} from '@/front/components/nav-section';
import { Scrollbar } from '@/front/components/scrollbar';
import { usePathname } from '@/front/hooks/use-pathname';

import { NavUpgrade } from '../components/nav-upgrade';
import { layoutClasses } from '../core/classes';

// ----------------------------------------------------------------------

type NavMobileProps = NavSectionProps & {
	open: boolean;
	onClose: () => void;
	slots?: {
		topArea?: React.ReactNode;
		bottomArea?: React.ReactNode;
	};
};

export const NavMobile = ({
	sx,
	data,
	open,
	slots,
	onClose,
	className,
	checkPermissions,
	...other
}: NavMobileProps) => {
	const pathname = usePathname();

	// biome-ignore lint/correctness/useExhaustiveDependencies: code from template leave as is for now
	useEffect(() => {
		if (open) {
			onClose();
		}
	}, [pathname]);

	return (
		<Drawer
			open={open}
			onClose={onClose}
			slotProps={{
				paper: {
					className: mergeClasses([
						layoutClasses.nav.root,
						layoutClasses.nav.vertical,
						className,
					]),
					sx: [
						{
							overflow: 'unset',
							bgcolor: 'var(--layout-nav-bg)',
							width: 'var(--layout-nav-mobile-width)',
						},
						...(Array.isArray(sx) ? sx : [sx]),
					],
				},
			}}
		>
			{slots?.topArea ?? (
				<Box sx={{ pl: 3.5, pt: 2.5, pb: 1 }}>
					<Logo />
				</Box>
			)}

			<Scrollbar fillContent>
				<NavSectionVertical
					data={data}
					checkPermissions={checkPermissions}
					sx={{ px: 2, flex: '1 1 auto' }}
					{...other}
				/>
				<NavUpgrade />
			</Scrollbar>

			{slots?.bottomArea}
		</Drawer>
	);
};
