import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import { mergeClasses } from 'minimal-shared/utils';
import { useEffect } from 'react';

import { Logo } from '#app/components/logo/index.ts';
import {
	type NavSectionProps,
	NavSectionVertical,
} from '#app/components/nav-section/index.ts';
import { Scrollbar } from '#app/components/scrollbar/index.ts';
import { usePathname } from '#app/hooks/use-pathname.ts';

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

	useEffect(
		() => {
			if (open) {
				onClose();
			}
		},
		// oxlint-disable-next-line react/exhaustive-deps -- code from template leave as is for now
		[pathname],
	);

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
			</Scrollbar>

			{slots?.bottomArea}
		</Drawer>
	);
};
