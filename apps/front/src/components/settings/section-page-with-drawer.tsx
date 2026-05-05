import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import { useBoolean } from 'minimal-shared/hooks';

import { Iconify } from '@/front/components/iconify/iconify';

import { SettingsPageHeader } from './settings-page-header';

type SectionPageWithDrawerProps = {
	subtitle: string;
	title: string;
	ctaLabel: string;
	drawerWidth?: number;
	drawerContent: React.ReactNode;
	children: React.ReactNode;
};

export const SectionPageWithDrawer = ({
	subtitle,
	title,
	ctaLabel,
	drawerWidth = 400,
	drawerContent,
	children,
}: SectionPageWithDrawerProps) => {
	const openDrawer = useBoolean();

	return (
		<Stack spacing={3}>
			<Stack direction="row" alignItems="center" justifyContent="space-between">
				<SettingsPageHeader subtitle={subtitle} title={title} />
				<Button
					variant="contained"
					onClick={openDrawer.onTrue}
					startIcon={<Iconify icon="mingcute:add-line" />}
				>
					{ctaLabel}
				</Button>
			</Stack>

			{children}

			<Drawer
				open={openDrawer.value}
				onClose={openDrawer.onFalse}
				anchor="right"
				sx={(theme) => ({
					zIndex: theme.zIndex.modal + 1,
				})}
				slotProps={{
					paper: { sx: { width: drawerWidth } },
				}}
			>
				{drawerContent}
			</Drawer>
		</Stack>
	);
};
