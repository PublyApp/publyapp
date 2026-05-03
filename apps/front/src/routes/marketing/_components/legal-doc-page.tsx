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

// ----------------------------------------------------------------------

export const LEGAL_H2_SX = {
	fontSize: { xs: 22, md: 26 },
	fontWeight: 700,
	color: 'text.primary',
	mb: 2,
} as const;

export const LEGAL_P_SX = {
	fontSize: 15,
	color: 'text.secondary',
	lineHeight: 1.75,
} as const;

const READING_COLUMN_W = 720;
const TOC_SIDEBAR_W = 240;

// ----------------------------------------------------------------------

type LegalDocPageProps = {
	eyebrow: string;
	title: string;
	lastUpdated: string; // ISO date string, e.g. '2026-05-02'
	toc: TocItem[];
	children: ReactNode;
};

// ----------------------------------------------------------------------

const TocSidebarContent = ({
	toc,
	activeId,
}: {
	toc: TocItem[];
	activeId: string | null;
}) => {
	return (
		<>
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
		</>
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
				{/* 2-column wrapper: hero + body share the LEFT reading column so they
				    align on the same left edge; TOC sidebar is the RIGHT direct flex
				    child so position:sticky has a tall scroll context to stick within. */}
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', lg: 'row' },
						gap: { xs: 4, lg: 8 },
						justifyContent: { lg: 'space-between' },
						alignItems: 'flex-start',
					}}
				>
					{/* Left column: hero band + body slot, both at the same x-origin */}
					<Box
						sx={(theme) => ({
							width: { xs: '100%', lg: READING_COLUMN_W },
							maxWidth: READING_COLUMN_W,
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
						{/* Hero band */}
						<Stack spacing={2} sx={{ mb: { xs: 6, md: 8 } }}>
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

						{/* Body content slot */}
						{children}
					</Box>

					{/* Right column: sticky TOC sidebar — desktop only.
					    Sticky lives on this Box (a direct flex child) so its scroll
					    context is the tall flex container, not a height-collapsed wrapper. */}
					<Box
						component="nav"
						aria-label="Table of contents"
						sx={(theme) => ({
							display: { xs: 'none', lg: 'block' },
							position: 'sticky',
							top: 'var(--layout-header-mobile-height)',
							[theme.breakpoints.up('md')]: {
								top: 'var(--layout-header-desktop-height)',
							},
							width: TOC_SIDEBAR_W,
							flexShrink: 0,
							alignSelf: 'flex-start',
							py: 4,
						})}
					>
						<TocSidebarContent toc={toc} activeId={activeId} />
					</Box>
				</Box>
			</Container>
		</Box>
	);
};
