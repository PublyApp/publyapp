import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import { useBoolean } from 'minimal-shared/hooks';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { SettingsPageHeader } from './settings-page-header';

type SectionPageWithDrawerContextValue = {
	openDrawer: () => void;
	closeDrawer: () => void;
};

const SectionPageWithDrawerContext =
	createContext<SectionPageWithDrawerContextValue | null>(null);

export const useSectionPageWithDrawer = () => {
	const context = useContext(SectionPageWithDrawerContext);

	if (context === null) {
		throw new Error(
			'useSectionPageWithDrawer must be used within SectionPageWithDrawer',
		);
	}

	return context;
};

type SectionPageWithDrawerProps = {
	subtitle: string;
	title: string;
	ctaLabel: string;
	drawerWidth?: number;
	drawerContent: ReactNode;
	children: ReactNode;
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
	const { t } = useTranslate();
	// Internal state for controlled/uncontrolled scenarios
	const internalOpen = useBoolean();
	// Determine effective state: controlled takes priority, then internal
	const isControlled = open !== undefined;
	const effectiveOpen = isControlled ? open : internalOpen.value;
	const effectiveOnOpen = onOpen ?? internalOpen.onTrue;
	const effectiveOnClose = onClose ?? internalOpen.onFalse;
	const contextValue = useMemo(() => {
		return {
			openDrawer: effectiveOnOpen,
			closeDrawer: effectiveOnClose,
		};
	}, [effectiveOnClose, effectiveOnOpen]);

	return (
		<SectionPageWithDrawerContext.Provider value={contextValue}>
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
						startIcon={<Iconify width={16} icon="mingcute:add-line" />}
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
						paper: {
							sx: {
								width: drawerWidth,
								overflow: 'unset',
							},
						},
					}}
				>
					<DrawerAnchor
						onClick={effectiveOnClose}
						aria-label={t('close')}
						sx={{ left: 0 }}
					>
						<Iconify icon="mingcute:close-line" width={18} />
					</DrawerAnchor>
					{drawerContent}
				</Drawer>
			</Stack>
		</SectionPageWithDrawerContext.Provider>
	);
};
