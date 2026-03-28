import Box from '@mui/material/Box';
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
	open?: boolean;
	onOpen?: () => void;
	onClose?: () => void;
};

export const SectionPageWithDrawer = ({
	subtitle,
	title,
	ctaLabel,
	drawerWidth = 400,
	drawerContent,
	children,
	open,
	onOpen,
	onClose,
}: SectionPageWithDrawerProps) => {
	// Internal state for controlled/uncontrolled scenarios
	const internalOpen = useBoolean();
	// Determine effective state: controlled takes priority, then internal
	const isControlled = open !== undefined;
	const effectiveOpen = isControlled ? open : internalOpen.value;
	const effectiveOnOpen = onOpen ?? internalOpen.onTrue;
	const effectiveOnClose = onClose ?? internalOpen.onFalse;

	return (
		<Stack spacing={3} sx={{ flexGrow: 1, minHeight: 0 }}>
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="space-between"
				sx={{ flexShrink: 0 }}
			>
				<SettingsPageHeader subtitle={subtitle} title={title} />
				<Button
					variant="contained"
					onClick={effectiveOnOpen}
					startIcon={<Iconify icon="mingcute:add-line" />}
				>
					{ctaLabel}
				</Button>
			</Stack>

			<Box
				sx={{
					flexGrow: 1,
					minHeight: 0,
					display: 'flex',
					flexDirection: 'column',
				}}
			>
				{children}
			</Box>

			<Drawer
				open={effectiveOpen}
				onClose={effectiveOnClose}
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
