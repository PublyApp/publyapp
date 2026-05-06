import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { BlogFigure } from '#app/routes/marketing/_components/blog-content-elements.tsx';
import { EntryTypePill } from '#app/routes/marketing/_components/entry-type-pill.tsx';
import {
	slugifyVersion,
	VersionPill,
} from '#app/routes/marketing/_components/version-pill.tsx';
import type { ChangelogEntry as ChangelogEntryType } from '#app/routes/marketing/_data/changelog.tsx';

// ----------------------------------------------------------------------

const formatDate = (
	iso: string,
): { dayMonth: string; year: string; full: string } => {
	const d = new Date(iso);
	const dayMonth = d
		.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
		.toUpperCase();
	const year = d.toLocaleDateString('en-US', { year: 'numeric' });
	const full = d
		.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
		})
		.toUpperCase();
	return { dayMonth, year, full };
};

// ----------------------------------------------------------------------

const unsplashCover = (slug: string): string => {
	return `https://images.unsplash.com/photo-${slug}?w=800&h=450&fit=crop&auto=format&q=80`;
};

// ----------------------------------------------------------------------

type ChangelogEntryProps = {
	entry: ChangelogEntryType;
};

export const ChangelogEntry = ({ entry }: ChangelogEntryProps) => {
	const slug = slugifyVersion(entry.version);
	const date = formatDate(entry.date);

	return (
		<Box
			id={slug}
			sx={{
				display: 'grid',
				gridTemplateColumns: { xs: '1fr', lg: '140px 1fr' },
				alignItems: 'flex-start',
				// scrollMarginTop parks the entry below the fixed topbar when
				// targeted via #anchor (direct URL load OR VersionPill click).
				scrollMarginTop: 'calc(var(--layout-header-desktop-height) + 24px)',
			}}
		>
			{/* Date column — sticky on lg+, hidden on xs/sm/md. */}
			<Box
				sx={{
					display: { xs: 'none', lg: 'block' },
					position: 'sticky',
					top: 'calc(var(--layout-header-desktop-height) + 32px)',
					pr: 6,
					textAlign: 'right',
					alignSelf: 'flex-start',
				}}
			>
				<Typography
					sx={{
						fontSize: 24,
						fontWeight: 700,
						color: 'text.primary',
						lineHeight: 1,
						letterSpacing: '-0.01em',
					}}
				>
					{date.dayMonth}
				</Typography>
				<Typography
					sx={{
						fontSize: 11,
						fontWeight: 700,
						letterSpacing: '0.12em',
						textTransform: 'uppercase',
						color: 'text.secondary',
						mt: 0.75,
					}}
				>
					{date.year}
				</Typography>
			</Box>

			{/* Content column — node dot + dashed line live on the left rail. */}
			<Box
				sx={{
					position: 'relative',
					pl: { xs: 3, lg: 5 },
					pb: { xs: 8, md: 10 },
					ml: { xs: 1, lg: 0 },
					borderLeft: '1px dashed',
					borderLeftColor: 'divider',
				}}
			>
				{/* Node dot (green) — punched out of the dashed line via ring. */}
				<Box
					aria-hidden="true"
					sx={{
						position: 'absolute',
						top: 4,
						left: '-5.5px',
						width: 10,
						height: 10,
						borderRadius: '50%',
						bgcolor: 'primary.main',
						boxShadow: '0 0 0 4px var(--mui-palette-background-default)',
					}}
				/>

				{/* Mobile-only inline date — the desktop date column is hidden. */}
				<Typography
					sx={{
						display: { xs: 'block', lg: 'none' },
						fontSize: 13,
						fontWeight: 700,
						color: 'text.primary',
						mb: 2,
					}}
				>
					{date.full}
				</Typography>

				{/* Pills row: version + types */}
				<Stack
					direction="row"
					spacing={1.25}
					alignItems="center"
					sx={{ flexWrap: 'wrap', mb: 2 }}
				>
					<VersionPill version={entry.version} />
					{entry.types.map((type) => {
						return <EntryTypePill key={type} type={type} />;
					})}
				</Stack>

				<Typography
					component="h3"
					sx={{
						fontSize: { xs: 20, md: 22 },
						fontWeight: 700,
						color: 'text.primary',
						letterSpacing: '-0.01em',
						mb: 2,
					}}
				>
					{entry.title}
				</Typography>

				<Box>{entry.body}</Box>

				{entry.heroImageSlug ? (
					<BlogFigure
						src={unsplashCover(entry.heroImageSlug)}
						alt={entry.title}
						ratio="16/9"
					/>
				) : null}

				{entry.relatedBlogSlug ? (
					<Box
						component={RouterLink}
						href={`/blog/${entry.relatedBlogSlug}`}
						sx={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 0.75,
							mt: 2,
							color: 'primary.main',
							fontSize: 14,
							fontWeight: 600,
							textDecoration: 'none',
							'&:hover': { textDecoration: 'underline' },
							'& .arrow': { transition: 'transform 200ms ease' },
							'&:hover .arrow': { transform: 'translateX(3px)' },
						}}
					>
						Read full release notes
						<Iconify icon="ph:arrow-right-bold" width={14} className="arrow" />
					</Box>
				) : null}
			</Box>
		</Box>
	);
};
