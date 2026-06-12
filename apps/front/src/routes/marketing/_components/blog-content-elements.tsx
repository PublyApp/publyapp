import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { Image } from '#app/components/image/image.tsx';

// ----------------------------------------------------------------------
// Blog content element primitives + typography sx presets.
//
// Single source of truth for everything that can appear *inside* a blog
// article body (post-hero, pre-share-row). Each article composes from these
// primitives + the BLOG_*_SX exports below — no per-article ad-hoc styling.
//
// To preview every element type at once, see the kitchen-sink article:
//   apps/front/src/routes/marketing/blog/_articles/multi-tenant-architecture-lessons-article.tsx
// ----------------------------------------------------------------------

// =====================================================================
// TYPOGRAPHY SX PRESETS
// =====================================================================

// Lead paragraph — the article's first ~2 sentences. Slightly larger than
// body, dark color, sets the tone before BLOG_P_SX takes over.
export const BLOG_LEAD_SX: SxProps<Theme> = {
	fontSize: { xs: 18, md: 20 },
	color: 'text.primary',
	lineHeight: 1.7,
	fontWeight: 400,
};

export const BLOG_H3_SX: SxProps<Theme> = {
	fontSize: { xs: 20, md: 22 },
	fontWeight: 700,
	color: 'text.primary',
	letterSpacing: '-0.015em',
	mt: { xs: 4, md: 5 },
	mb: 1.5,
	scrollMarginTop: 'calc(var(--layout-header-desktop-height) + 24px)',
};

export const BLOG_H4_SX: SxProps<Theme> = {
	fontSize: { xs: 17, md: 18 },
	fontWeight: 700,
	color: 'text.primary',
	letterSpacing: '-0.01em',
	mt: 3,
	mb: 1,
};

// Inline link inside body prose — green underline style, easy to spot.
export const BLOG_LINK_SX: SxProps<Theme> = {
	color: 'primary.main',
	textDecoration: 'underline',
	textDecorationColor: 'transparent',
	textUnderlineOffset: '3px',
	textDecorationThickness: '1px',
	transition: 'text-decoration-color 200ms ease',
	'&:hover': { textDecorationColor: 'currentColor' },
};

// Inline `<code>` — small monospace pill on a tinted background.
export const BLOG_CODE_INLINE_SX: SxProps<Theme> = {
	display: 'inline',
	fontFamily:
		'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
	fontSize: '0.92em',
	bgcolor: 'background.neutral',
	border: '1px solid',
	borderColor: 'divider',
	borderRadius: '4px',
	px: '6px',
	py: '1px',
	color: 'text.primary',
};

// Bullet list — disc + comfortable spacing. <ul> children handle <li>.
export const BLOG_UL_SX: SxProps<Theme> = {
	listStyleType: 'disc',
	pl: 3,
	my: 2,
	'& li': {
		mb: 1,
		fontSize: { xs: 16, md: 17 },
		color: 'text.secondary',
		lineHeight: 1.7,
		pl: 0.5,
		'&::marker': { color: 'text.disabled' },
	},
	'& li > ul, & li > ol': {
		my: 1,
	},
};

// Numbered list — same shape as UL, with decimal markers.
export const BLOG_OL_SX: SxProps<Theme> = {
	listStyleType: 'decimal',
	pl: 3,
	my: 2,
	'& li': {
		mb: 1,
		fontSize: { xs: 16, md: 17 },
		color: 'text.secondary',
		lineHeight: 1.7,
		pl: 0.5,
		'&::marker': { color: 'text.disabled', fontWeight: 600 },
	},
	'& li > ul, & li > ol': {
		my: 1,
	},
};

// Plain inline blockquote — left-rail accent + slight tinted bg.
// For HEAVY editorial pull-quotes, use <BlogPullQuote> instead.
export const BLOG_BLOCKQUOTE_SX: SxProps<Theme> = {
	borderLeft: '4px solid',
	borderLeftColor: 'primary.main',
	bgcolor: 'background.neutral',
	pl: 3,
	pr: 2,
	py: 2,
	my: 3,
	borderRadius: '0 8px 8px 0',
	'& p': {
		fontSize: { xs: 16, md: 17 },
		color: 'text.primary',
		fontStyle: 'italic',
		lineHeight: 1.6,
		m: 0,
	},
};

export const BLOG_HR_SX: SxProps<Theme> = {
	border: 'none',
	borderTop: '1px solid',
	borderTopColor: 'divider',
	my: { xs: 5, md: 6 },
};

// =====================================================================
// COMPONENTS
// =====================================================================

// Code block — dark surface with optional language tag and traffic-light
// header. Syntax-highlighting is OPTIONAL: pass children as plain string
// (will render unstyled) or as JSX with <Token> spans for visual variety.
// Real syntax highlighting (prismjs/shiki) is intentionally out of scope —
// keeps the bundle lean for placeholder content.
export const BlogCodeBlock = ({
	language,
	children,
	withChrome = true,
}: {
	language?: string;
	children: ReactNode;
	withChrome?: boolean;
}) => {
	return (
		<Box
			component="figure"
			sx={{
				m: 0,
				my: { xs: 3, md: 4 },
				borderRadius: '12px',
				bgcolor: '#1F1F1F',
				border: '1px solid rgba(255,255,255,0.08)',
				overflow: 'hidden',
				boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
			}}
		>
			{withChrome ? (
				<Stack
					direction="row"
					alignItems="center"
					justifyContent="space-between"
					sx={{
						px: 2,
						py: 1.25,
						borderBottom: '1px solid rgba(255,255,255,0.08)',
						bgcolor: '#242424',
					}}
				>
					<Stack direction="row" spacing={0.75}>
						<Box
							sx={{
								width: 10,
								height: 10,
								borderRadius: '50%',
								bgcolor: 'rgba(244,63,94,0.5)',
								border: '1px solid rgba(244,63,94,0.8)',
							}}
						/>
						<Box
							sx={{
								width: 10,
								height: 10,
								borderRadius: '50%',
								bgcolor: 'rgba(234,179,8,0.5)',
								border: '1px solid rgba(234,179,8,0.8)',
							}}
						/>
						<Box
							sx={{
								width: 10,
								height: 10,
								borderRadius: '50%',
								bgcolor: 'rgba(34,197,94,0.5)',
								border: '1px solid rgba(34,197,94,0.8)',
							}}
						/>
					</Stack>
					{language ? (
						<Typography
							component="span"
							sx={{
								fontSize: 10,
								fontWeight: 700,
								letterSpacing: '0.15em',
								textTransform: 'uppercase',
								color: 'rgba(255,255,255,0.55)',
								fontFamily:
									'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
							}}
						>
							{language}
						</Typography>
					) : null}
				</Stack>
			) : null}
			<Box
				component="pre"
				sx={{
					m: 0,
					p: { xs: 2, md: 3 },
					overflowX: 'auto',
					fontSize: 13,
					lineHeight: 1.6,
					color: 'rgba(229,231,235,0.95)',
					fontFamily:
						'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
					'& code': {
						background: 'transparent',
						p: 0,
						border: 'none',
						color: 'inherit',
						fontFamily: 'inherit',
						fontSize: 'inherit',
					},
					// Pseudo-syntax-highlighting tokens. Inline class names so
					// articles can decorate code without a real highlighter.
					'& .tk-com': { color: '#7c8493', fontStyle: 'italic' }, // comment
					'& .tk-kw': { color: '#f472b6' }, // keyword
					'& .tk-fn': { color: '#60a5fa' }, // function
					'& .tk-str': { color: '#a7f3d0' }, // string
					'& .tk-num': { color: '#fbbf24' }, // number
					'& .tk-cls': { color: '#fde047' }, // class/type
					'& .tk-pun': { color: '#9ca3af' }, // punctuation
				}}
			>
				<Box component="code">{children}</Box>
			</Box>
		</Box>
	);
};

// Callout box — colored left rail + icon + optional title + body. Use the
// `variant` prop to switch the accent (info/tip/warning/success). Keep
// content inside short — these are not full sub-sections.
type CalloutVariant = 'info' | 'tip' | 'warning' | 'success';

const CALLOUT_PRESETS: Record<
	CalloutVariant,
	{ icon: IconifyName; tone: string; tint: string; border: string }
> = {
	info: {
		icon: 'ph:lifebuoy-bold',
		tone: '#2563EB',
		tint: 'rgba(37,99,235,0.06)',
		border: 'rgba(37,99,235,0.20)',
	},
	tip: {
		icon: 'ph:lightning-fill',
		tone: '#10B981',
		tint: 'rgba(16,185,129,0.06)',
		border: 'rgba(16,185,129,0.22)',
	},
	warning: {
		icon: 'ph:shield-warning-bold',
		tone: '#D97706',
		tint: 'rgba(217,119,6,0.06)',
		border: 'rgba(217,119,6,0.22)',
	},
	success: {
		icon: 'ph:check-circle-bold',
		tone: '#059669',
		tint: 'rgba(5,150,105,0.06)',
		border: 'rgba(5,150,105,0.22)',
	},
};

export const BlogCallout = ({
	variant = 'info',
	title,
	children,
}: {
	variant?: CalloutVariant;
	title?: string;
	children: ReactNode;
}) => {
	const preset = CALLOUT_PRESETS[variant];

	return (
		<Stack
			direction="row"
			spacing={2}
			sx={{
				my: { xs: 3, md: 4 },
				p: { xs: 2.5, md: 3 },
				borderRadius: '12px',
				bgcolor: preset.tint,
				border: '1px solid',
				borderColor: preset.border,
			}}
		>
			<Box
				sx={{
					flexShrink: 0,
					mt: 0.25,
					color: preset.tone,
				}}
			>
				<Iconify icon={preset.icon} width={22} />
			</Box>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				{title ? (
					<Typography
						component="p"
						sx={{
							fontSize: 11,
							fontWeight: 700,
							letterSpacing: '0.12em',
							textTransform: 'uppercase',
							color: preset.tone,
							mb: 0.5,
						}}
					>
						{title}
					</Typography>
				) : null}
				<Box
					sx={{
						fontSize: { xs: 14, md: 15 },
						color: 'text.primary',
						lineHeight: 1.65,
						'& p': { m: 0 },
						'& p + p': { mt: 1 },
						'& code': BLOG_CODE_INLINE_SX,
					}}
				>
					{children}
				</Box>
			</Box>
		</Stack>
	);
};

// Pull quote — large editorial blockquote with optional attribution.
// Visually distinct from BLOG_BLOCKQUOTE_SX (which is for inline quotes).
// Use this once or twice per article max — the typography is loud.
export const BlogPullQuote = ({
	children,
	attribution,
	occupation,
}: {
	children: ReactNode;
	attribution?: string;
	occupation?: string;
}) => {
	return (
		<Box
			component="figure"
			sx={{
				m: 0,
				my: { xs: 5, md: 7 },
				py: { xs: 3, md: 4 },
				borderTop: '1px solid',
				borderBottom: '1px solid',
				borderTopColor: 'divider',
				borderBottomColor: 'divider',
				position: 'relative',
			}}
		>
			<Iconify
				icon="ph:quotes-fill"
				width={32}
				sx={{
					color: 'primary.main',
					opacity: 0.6,
					mb: 1.5,
					display: 'block',
				}}
			/>
			<Typography
				component="blockquote"
				sx={{
					m: 0,
					fontSize: { xs: 20, md: 24 },
					fontWeight: 500,
					color: 'text.primary',
					lineHeight: 1.4,
					letterSpacing: '-0.015em',
				}}
			>
				{children}
			</Typography>
			{attribution ? (
				<Typography
					component="figcaption"
					sx={{
						mt: 2,
						fontSize: 13,
						color: 'text.secondary',
					}}
				>
					—{' '}
					<strong style={{ color: 'inherit', fontWeight: 700 }}>
						{attribution}
					</strong>
					{occupation ? `, ${occupation}` : null}
				</Typography>
			) : null}
		</Box>
	);
};

// Image figure — wraps the canon <Image> with an optional caption. Use
// for any inline content image inside the article body.
export const BlogFigure = ({
	src,
	alt,
	caption,
	ratio = '16/9',
}: {
	src: string;
	alt: string;
	caption?: ReactNode;
	ratio?: '16/9' | '16/10' | '4/3' | '2/1' | '1/1' | '3/2';
}) => {
	return (
		<Box component="figure" sx={{ m: 0, my: { xs: 4, md: 5 } }}>
			<Box
				sx={{
					borderRadius: { xs: '12px', md: '16px' },
					overflow: 'hidden',
					border: '1px solid',
					borderColor: 'divider',
				}}
			>
				<Image src={src} alt={alt} ratio={ratio} />
			</Box>
			{caption ? (
				<Typography
					component="figcaption"
					sx={{
						mt: 1.5,
						fontSize: 13,
						color: 'text.secondary',
						textAlign: 'center',
						fontStyle: 'italic',
					}}
				>
					{caption}
				</Typography>
			) : null}
		</Box>
	);
};

// Image gallery — 2 or 3 images side by side with shared caption. Falls
// to a stack on mobile.
export const BlogGallery = ({
	images,
	caption,
}: {
	images: {
		src: string;
		alt: string;
		ratio?: '16/9' | '4/3' | '1/1' | '3/2';
	}[];
	caption?: ReactNode;
}) => {
	return (
		<Box component="figure" sx={{ m: 0, my: { xs: 4, md: 5 } }}>
			<Box
				sx={{
					display: 'grid',
					gridTemplateColumns: {
						xs: '1fr',
						sm: `repeat(${images.length}, 1fr)`,
					},
					gap: { xs: 2, md: 2.5 },
				}}
			>
				{images.map((img) => {
					return (
						<Box
							key={img.src}
							sx={{
								borderRadius: { xs: '10px', md: '12px' },
								overflow: 'hidden',
								border: '1px solid',
								borderColor: 'divider',
							}}
						>
							<Image src={img.src} alt={img.alt} ratio={img.ratio ?? '4/3'} />
						</Box>
					);
				})}
			</Box>
			{caption ? (
				<Typography
					component="figcaption"
					sx={{
						mt: 1.5,
						fontSize: 13,
						color: 'text.secondary',
						textAlign: 'center',
						fontStyle: 'italic',
					}}
				>
					{caption}
				</Typography>
			) : null}
		</Box>
	);
};

// Table — styled HTML table with sticky header, zebra rows, optional
// caption. Both `columns` and `rows` carry stable string keys so React
// reconciles correctly even if cells are reordered or content swapped.
// Each row's `cells` array maps positionally to `columns`. For complex
// tables (cell merging, custom JSX per cell), drop down to raw <table> + sx.
export type BlogTableColumn = { key: string; label: ReactNode };
export type BlogTableRow = { key: string; cells: ReactNode[] };

export const BlogTable = ({
	columns,
	rows,
	caption,
}: {
	columns: BlogTableColumn[];
	rows: BlogTableRow[];
	caption?: ReactNode;
}) => {
	return (
		<Box
			component="figure"
			sx={{
				m: 0,
				my: { xs: 3, md: 4 },
				overflowX: 'auto',
				borderRadius: '12px',
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Box
				component="table"
				sx={{
					width: '100%',
					borderCollapse: 'collapse',
					fontSize: 14,
					'& thead th': {
						textAlign: 'left',
						py: 1.5,
						px: 2,
						bgcolor: 'background.neutral',
						color: 'text.primary',
						fontWeight: 700,
						fontSize: 12,
						textTransform: 'uppercase',
						letterSpacing: '0.05em',
						borderBottom: '1px solid',
						borderBottomColor: 'divider',
					},
					'& tbody td': {
						py: 1.5,
						px: 2,
						color: 'text.secondary',
						borderBottom: '1px solid',
						borderBottomColor: 'divider',
						verticalAlign: 'top',
					},
					'& tbody tr:last-of-type td': { borderBottom: 'none' },
					'& tbody tr:nth-of-type(even)': {
						bgcolor: 'background.neutral',
					},
				}}
			>
				{caption ? (
					<Box
						component="caption"
						sx={{
							captionSide: 'bottom',
							mt: 1.5,
							fontSize: 13,
							color: 'text.secondary',
							fontStyle: 'italic',
						}}
					>
						{caption}
					</Box>
				) : null}
				<thead>
					<tr>
						{columns.map((col) => {
							return <th key={col.key}>{col.label}</th>;
						})}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						return (
							<tr key={row.key}>
								{row.cells.map((cell, cellIndex) => {
									// Cell key composes row key + the column key at the
									// same positional index — stable across re-renders.
									const colKey = columns[cellIndex]?.key ?? `c${cellIndex}`;
									return <td key={`${row.key}-${colKey}`}>{cell}</td>;
								})}
							</tr>
						);
					})}
				</tbody>
			</Box>
		</Box>
	);
};

// Video embed — responsive iframe wrapper. Pass YouTube/Vimeo embed URL.
// For static/placeholder use, omit `src` and a play-button placeholder
// renders instead.
export const BlogVideo = ({
	src,
	title,
	caption,
	posterSrc,
}: {
	src?: string;
	title: string;
	caption?: ReactNode;
	posterSrc?: string;
}) => {
	return (
		<Box component="figure" sx={{ m: 0, my: { xs: 4, md: 5 } }}>
			<Box
				sx={{
					position: 'relative',
					width: '100%',
					aspectRatio: '16 / 9',
					borderRadius: { xs: '12px', md: '16px' },
					overflow: 'hidden',
					border: '1px solid',
					borderColor: 'divider',
					bgcolor: '#0F1419',
				}}
			>
				{src ? (
					<Box
						component="iframe"
						src={src}
						title={title}
						loading="lazy"
						allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
						allowFullScreen
						sx={{
							position: 'absolute',
							inset: 0,
							width: '100%',
							height: '100%',
							border: 'none',
						}}
					/>
				) : (
					<>
						{posterSrc ? (
							<Box
								sx={{
									position: 'absolute',
									inset: 0,
									'& > div, & img': {
										width: '100%',
										height: '100%',
										objectFit: 'cover',
									},
								}}
							>
								<Image src={posterSrc} alt={title} ratio="16/9" />
							</Box>
						) : null}
						<Box
							sx={{
								position: 'absolute',
								inset: 0,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								bgcolor: 'rgba(0,0,0,0.35)',
							}}
						>
							<Box
								sx={{
									width: 64,
									height: 64,
									borderRadius: '50%',
									display: 'inline-flex',
									alignItems: 'center',
									justifyContent: 'center',
									bgcolor: 'common.white',
									color: 'primary.main',
									boxShadow: '0 8px 24px rgba(0,0,0,0.30)',
								}}
							>
								<Iconify icon="ph:play-circle-fill" width={36} />
							</Box>
						</Box>
					</>
				)}
			</Box>
			{caption ? (
				<Typography
					component="figcaption"
					sx={{
						mt: 1.5,
						fontSize: 13,
						color: 'text.secondary',
						textAlign: 'center',
						fontStyle: 'italic',
					}}
				>
					{caption}
				</Typography>
			) : null}
		</Box>
	);
};

// Token spans for the pseudo-syntax-highlighting inside <BlogCodeBlock>.
// Pass children of <BlogCodeBlock> as JSX using these to add color
// without a real highlighter. Class names map to selectors in the block's
// `& .tk-*` rules above.
export const Token = ({
	type,
	children,
}: {
	type: 'com' | 'kw' | 'fn' | 'str' | 'num' | 'cls' | 'pun';
	children: ReactNode;
}) => {
	return (
		<Box component="span" className={`tk-${type}`}>
			{children}
		</Box>
	);
};
