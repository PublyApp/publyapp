import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import type { Theme } from '@mui/material/styles';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useBoolean } from 'minimal-shared/hooks';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

export type TocSection = {
	id: string;
	label: string;
	level?: number;
};

export const StaffProfilePermissionsToc = ({
	sections,
	activeId,
	onNavigate,
}: {
	sections: TocSection[];
	activeId: string | null;
	onNavigate: (id: string) => void;
}) => {
	const { t } = useTranslate();
	const theme = useTheme();
	const isDesktop = useMediaQuery((t: Theme) => t.breakpoints.up('lg'));
	const tocDrawer = useBoolean();

	const content = (
		<TocList
			sections={sections}
			activeId={activeId}
			onNavigate={(id) => {
				onNavigate(id);
				if (!isDesktop) {
					tocDrawer.onFalse();
				}
			}}
		/>
	);

	if (isDesktop) {
		return (
			<Box
				sx={{
					position: 'sticky',
					top: 80,
					alignSelf: 'flex-start',
					maxHeight: 'calc(100vh - 100px)',
					overflowY: 'auto',
				}}
			>
				<Typography
					variant="overline"
					sx={{ color: 'text.secondary', display: 'block', mb: 1 }}
				>
					{t('on-this-page')}
				</Typography>
				{content}
			</Box>
		);
	}

	// Mobile/tablet: fixed toggle + right drawer
	return (
		<>
			<Button
				onClick={tocDrawer.onTrue}
				variant="contained"
				size="small"
				startIcon={<Iconify icon="solar:list-bold" width={16} />}
				sx={{
					position: 'fixed',
					right: 12,
					// Keep it visible but out of the center of the screen: lean towards the top.
					top: 140,
					zIndex: theme.zIndex.appBar + 1,
					borderRadius: 999,
					minWidth: 0,
					px: 1.25,
					py: 0.75,
					boxShadow: 8,
				}}
				aria-label={t('on-this-page')}
				aria-expanded={tocDrawer.value}
				aria-controls="staff-profile-permissions-toc-drawer"
			>
				{t('toc')}
			</Button>

			<Drawer
				open={tocDrawer.value}
				onClose={tocDrawer.onFalse}
				anchor="right"
				sx={(theme) => ({
					zIndex: theme.zIndex.modal + 1,
				})}
				slotProps={{
					paper: {
						id: 'staff-profile-permissions-toc-drawer',
						sx: {
							width: 360,
							overflow: 'unset',
							p: 2,
							pt: 5,
						},
					},
				}}
			>
				<DrawerAnchor
					onClick={tocDrawer.onFalse}
					aria-label={t('close')}
					sx={{ left: 0 }}
				>
					<Iconify icon="mingcute:close-line" width={18} />
				</DrawerAnchor>

				<Typography variant="overline" sx={{ color: 'text.secondary', mb: 1 }}>
					{t('on-this-page')}
				</Typography>

				{content}
			</Drawer>
		</>
	);
};

const TocList = ({
	sections,
	activeId,
	onNavigate,
}: {
	sections: TocSection[];
	activeId: string | null;
	onNavigate: (id: string) => void;
}) => {
	const minLevel = sections.reduce<number>((acc, s) => {
		const lvl = s.level ?? 1;
		return Math.min(acc, lvl);
	}, Number.POSITIVE_INFINITY);

	return (
		<List
			dense
			disablePadding
			sx={{
				borderLeft: 1,
				borderColor: 'divider',
				pl: 1.5,
			}}
		>
			{sections.map((s) => {
				const selected = s.id === activeId;
				const levelOffset = Math.max(0, (s.level ?? 1) - (minLevel || 1));
				const paddingLeft = 1 + levelOffset * 1.5;

				return (
					<ListItemButton
						key={s.id}
						onClick={() => onNavigate(s.id)}
						selected={selected}
						dense
						aria-current={selected ? 'location' : undefined}
						sx={{
							position: 'relative',
							py: 0.75,
							pl: paddingLeft,
							pr: 1,
							borderRadius: 1,
							color: selected ? 'text.primary' : 'text.secondary',
							'&.Mui-selected': {
								bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
								'&:hover': {
									bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
								},
							},
							'&:hover': {
								color: 'text.primary',
							},
						}}
					>
						<Iconify
							icon="eva:arrowhead-right-fill"
							width={14}
							sx={{
								position: 'absolute',
								left: -18,
								top: '50%',
								transform: 'translateY(-50%)',
								color: 'primary.main',
								opacity: selected ? 1 : 0,
							}}
						/>
						<ListItemText
							primary={s.label}
							primaryTypographyProps={{
								variant: 'body2',
								noWrap: true,
								sx: {
									fontWeight: selected ? 600 : 400,
								},
							}}
						/>
					</ListItemButton>
				);
			})}
		</List>
	);
};
