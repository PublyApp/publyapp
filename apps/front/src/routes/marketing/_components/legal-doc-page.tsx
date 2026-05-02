import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { useActiveTocSection } from '#app/hooks/use-active-toc-section.ts';
import { fDate } from '#app/utils/format-time.ts';

// ----------------------------------------------------------------------

export type TocItem = {
	id: string;
	label: string;
};

type LegalDocPageProps = {
	eyebrow: string;
	title: string;
	lastUpdated: string; // ISO date string, e.g. '2026-05-02'
	toc: TocItem[];
	children: ReactNode;
};

// ----------------------------------------------------------------------

const TocSidebar = ({
	toc,
	activeId,
}: {
	toc: TocItem[];
	activeId: string | null;
}) => {
	return (
		<Box
			component="nav"
			aria-label="Table of contents"
			sx={(theme) => ({
				position: 'sticky',
				top: 'var(--layout-header-mobile-height)',
				[theme.breakpoints.up('md')]: {
					top: 'var(--layout-header-desktop-height)',
				},
				width: 240,
				flexShrink: 0,
				alignSelf: 'flex-start',
				py: 4,
			})}
		>
			<Typography
				sx={{
					fontSize: 11,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.1em',
					color: 'text.secondary',
					mb: 2,
					pl: 1.5,
				}}
			>
				On this page
			</Typography>
			<Stack spacing={0.5}>
				{toc.map((item) => {
					const isActive = activeId === item.id;

					return (
						<Box
							key={item.id}
							component="a"
							href={`#${item.id}`}
							sx={{
								display: 'block',
								fontSize: 13,
								fontWeight: isActive ? 600 : 400,
								color: isActive ? 'primary.main' : 'text.secondary',
								borderLeft: '2px solid',
								borderColor: isActive ? 'primary.main' : 'transparent',
								pl: 1.5,
								py: 0.5,
								textDecoration: 'none',
								transition: 'color 200ms ease, border-color 200ms ease',
								'&:hover': {
									color: 'text.primary',
								},
							}}
						>
							{item.label}
						</Box>
					);
				})}
			</Stack>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const LegalDocPage = ({
	eyebrow,
	title,
	lastUpdated,
	toc,
	children,
}: LegalDocPageProps) => {
	const ids = toc.map((item) => {
		return item.id;
	});
	const activeId = useActiveTocSection({ ids });

	return (
		<Box component="section">
			<Container
				maxWidth="lg"
				sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 8, md: 12 } }}
			>
				{/* Hero band */}
				<Stack spacing={2} sx={{ mb: { xs: 6, md: 8 }, maxWidth: 720 }}>
					<Typography
						sx={{
							fontSize: 12,
							fontWeight: 700,
							textTransform: 'uppercase',
							letterSpacing: '0.12em',
							color: 'primary.main',
						}}
					>
						{eyebrow}
					</Typography>
					<Typography
						component="h1"
						sx={{
							fontSize: { xs: 32, md: 44 },
							fontWeight: 700,
							lineHeight: 1.15,
							letterSpacing: '-0.02em',
							color: 'text.primary',
						}}
					>
						{title}
					</Typography>
					<Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
						Last updated {fDate(lastUpdated, 'MMMM D, YYYY')}
					</Typography>
				</Stack>

				{/* 2-column body: TOC right (lg+), content left */}
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', lg: 'row-reverse' },
						gap: { xs: 4, lg: 8 },
						alignItems: 'flex-start',
					}}
				>
					{/* TOC sidebar — desktop only */}
					<Box sx={{ display: { xs: 'none', lg: 'block' } }}>
						<TocSidebar toc={toc} activeId={activeId} />
					</Box>

					{/* Body content slot */}
					<Box
						sx={(theme) => ({
							flex: 1,
							maxWidth: 720,
							color: 'text.primary',
							// h2[id] anchor scroll lands below the sticky topbar (16px buffer)
							'& h2[id]': {
								scrollMarginTop:
									'calc(var(--layout-header-mobile-height) + 16px)',
								[theme.breakpoints.up('md')]: {
									scrollMarginTop:
										'calc(var(--layout-header-desktop-height) + 16px)',
								},
							},
						})}
					>
						{children}
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
