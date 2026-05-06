import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { Image } from '#app/components/image/image.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useActiveTocSection } from '#app/hooks/use-active-toc-section.ts';
import { copyToClipboard } from '#app/lib/clipboard.ts';
import { BlogPostCard } from '#app/routes/marketing/_components/blog-post-card.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import {
	BLOG_AUTHORS,
	BLOG_TAGS,
	getPublishedPosts,
	unsplashCover,
	type BlogPost,
} from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

export type TocItem = {
	id: string;
	label: string;
	level?: 1 | 2; // 1 = h2 (default), 2 = h3 (indented in TOC)
};

// ----------------------------------------------------------------------

export const BLOG_H2_SX: SxProps<Theme> = {
	fontSize: { xs: 24, md: 28 },
	fontWeight: 700,
	color: 'text.primary',
	letterSpacing: '-0.02em',
	mt: { xs: 5, md: 6 },
	mb: 2,
	scrollMarginTop: 'calc(var(--layout-header-desktop-height) + 24px)',
};

export const BLOG_P_SX: SxProps<Theme> = {
	fontSize: { xs: 16, md: 17 },
	color: 'text.secondary',
	lineHeight: 1.75,
};

// ----------------------------------------------------------------------

type BlogArticlePageProps = {
	post: BlogPost;
	tocItems: TocItem[]; // canonical list of {id, label, level?} matching the body's h2/h3 ids
	children: ReactNode;
};

// ----------------------------------------------------------------------

const formatPostDate = (iso: string): string => {
	return new Date(iso).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
};

const tagLabel = (value: BlogPost['tag']): string => {
	return BLOG_TAGS.find((t) => t.value === value)?.label ?? value;
};

// ----------------------------------------------------------------------

// Shared horizontal byline row used by `above-title` (centered) and
// `cinematic` (left-aligned over dark). Pass `tone="dark"` to flip text
// colors to white-on-dark for the cinematic variant.
const HeroByline = ({
	post,
	tone = 'light',
	align = 'center',
}: {
	post: BlogPost;
	tone?: 'light' | 'dark';
	align?: 'center' | 'flex-start';
}) => {
	const author = BLOG_AUTHORS[post.authorId];
	const isDark = tone === 'dark';
	const primaryColor = isDark ? 'rgba(255,255,255,0.95)' : 'text.primary';
	const mutedColor = isDark ? 'rgba(255,255,255,0.65)' : 'text.secondary';
	const dotColor = isDark ? 'rgba(255,255,255,0.30)' : 'divider';

	return (
		<Stack
			direction="row"
			spacing={1.5}
			alignItems="center"
			sx={{
				flexWrap: 'wrap',
				justifyContent: align === 'center' ? 'center' : 'flex-start',
			}}
		>
			<Image
				src={author.photoUrl}
				alt={author.name}
				ratio="1/1"
				sx={{
					width: 32,
					flexShrink: 0,
					borderRadius: '50%',
					overflow: 'hidden',
					bgcolor: 'background.neutral',
					border: isDark ? '1px solid rgba(255,255,255,0.30)' : 'none',
				}}
			/>
			<Typography sx={{ fontSize: 14, fontWeight: 700, color: primaryColor }}>
				{author.name}
			</Typography>
			<Box component="span" aria-hidden="true" sx={{ color: dotColor }}>
				·
			</Box>
			<Typography sx={{ fontSize: 14, color: mutedColor }}>
				{author.role}
			</Typography>
			<Box
				component="span"
				aria-hidden="true"
				sx={{ color: dotColor, display: { xs: 'none', sm: 'inline' } }}
			>
				·
			</Box>
			<Typography sx={{ fontSize: 14, color: mutedColor }}>
				{formatPostDate(post.publishedAt)}
			</Typography>
			<Box
				component="span"
				aria-hidden="true"
				sx={{ color: dotColor, display: { xs: 'none', sm: 'inline' } }}
			>
				·
			</Box>
			<Stack
				direction="row"
				spacing={0.5}
				alignItems="center"
				sx={{ fontSize: 14, color: mutedColor }}
			>
				<Iconify icon="ph:clock-bold" width={14} />
				<Box component="span">{post.readingMinutes} min read</Box>
			</Stack>
		</Stack>
	);
};

// ----------------------------------------------------------------------

// Variant A — Above-Title (canonical). Centered tag + h1 + byline, then a
// wide cover below at the same lg rail width. The catch-all default.
const AboveTitleHero = ({ post }: { post: BlogPost }) => {
	const coverUrl = unsplashCover(post.coverSlug, { w: 1600, h: 900 });

	return (
		<Box component="header" sx={{ pt: { xs: 8, md: 14 } }}>
			<Container maxWidth="lg">
				<Stack spacing={3} alignItems="center" sx={{ textAlign: 'center' }}>
					<MarketingEyebrow label={tagLabel(post.tag)} />
					<Typography
						component="h1"
						sx={{
							fontSize: { xs: 32, md: 48, lg: 56 },
							fontWeight: 800,
							color: 'text.primary',
							lineHeight: 1.1,
							letterSpacing: '-0.025em',
							maxWidth: 720,
						}}
					>
						{post.title}
					</Typography>
					<HeroByline post={post} />
				</Stack>
			</Container>
			<Container maxWidth="lg" sx={{ mt: { xs: 6, md: 10 } }}>
				<Image
					src={coverUrl}
					alt={post.title}
					ratio="16/9"
					sx={{
						borderRadius: { xs: '16px', md: '24px' },
						overflow: 'hidden',
						border: '1px solid',
						borderColor: 'divider',
					}}
				/>
			</Container>
		</Box>
	);
};

// Variant B — Split. 2-col with cover on the left (square aspect) and the
// title + excerpt + byline on the right. Best for customer stories /
// partner announcements where the visual carries narrative weight.
// Note: the canvas had floating "stat badges" hovering over the cover —
// those are case-study-specific data points and would feel fabricated on
// generic posts, so they're intentionally omitted here.
const SplitHero = ({ post }: { post: BlogPost }) => {
	const coverUrl = unsplashCover(post.coverSlug, { w: 1000, h: 1000 });

	return (
		<Box component="header" sx={{ pt: { xs: 8, md: 14 } }}>
			<Container maxWidth="lg">
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', lg: '1fr 1.1fr' },
						gap: { xs: 5, md: 8, lg: 12 },
						alignItems: 'center',
					}}
				>
					{/* Cover — square. Reverse stack order on mobile so title leads. */}
					<Box
						sx={{
							order: { xs: 2, lg: 1 },
							borderRadius: { xs: '20px', md: '24px' },
							overflow: 'hidden',
							border: '1px solid',
							borderColor: 'divider',
							boxShadow: '0 20px 40px -15px rgba(17,24,39,0.10)',
						}}
					>
						<Image
							src={coverUrl}
							alt={post.title}
							ratio="1/1"
							sx={{ overflow: 'hidden' }}
						/>
					</Box>

					<Stack
						spacing={3}
						alignItems="flex-start"
						sx={{ order: { xs: 1, lg: 2 }, maxWidth: 560 }}
					>
						<MarketingEyebrow label={tagLabel(post.tag)} />
						<Typography
							component="h1"
							sx={{
								fontSize: { xs: 32, md: 44, lg: 54 },
								fontWeight: 800,
								color: 'text.primary',
								lineHeight: 1.05,
								letterSpacing: '-0.025em',
							}}
						>
							{post.title}
						</Typography>
						<Typography
							sx={{
								fontSize: { xs: 16, md: 17 },
								color: 'text.secondary',
								lineHeight: 1.6,
							}}
						>
							{post.excerpt}
						</Typography>
						<HeroByline post={post} align="flex-start" />
					</Stack>
				</Box>
			</Container>
		</Box>
	);
};

// Variant C — Editorial. Zero image. Large white card with centered title
// and an italic kicker quote (uses `excerpt` as the pull-quote). Built for
// essays / opinion / reflective pieces; rewards typography over imagery
// and ships a near-instant LCP.
const EditorialHero = ({ post }: { post: BlogPost }) => {
	const author = BLOG_AUTHORS[post.authorId];

	return (
		<Box component="header" sx={{ pt: { xs: 8, md: 14 } }}>
			<Container maxWidth="lg">
				<Box
					sx={{
						p: { xs: 4, md: 8, lg: 10 },
						borderRadius: { xs: '24px', md: '32px' },
						bgcolor: 'background.paper',
						border: '1px solid',
						borderColor: 'divider',
						boxShadow: '0 1px 2px rgba(31,41,55,0.03)',
						textAlign: 'center',
					}}
				>
					<Stack
						spacing={4}
						alignItems="center"
						sx={{ maxWidth: 720, mx: 'auto' }}
					>
						<Typography
							component="span"
							sx={{
								fontSize: 10,
								fontWeight: 700,
								letterSpacing: '0.20em',
								textTransform: 'uppercase',
								color: 'text.secondary',
							}}
						>
							Essay · {tagLabel(post.tag)}
						</Typography>
						<Typography
							component="h1"
							sx={{
								fontSize: { xs: 32, md: 48, lg: 56 },
								fontWeight: 800,
								color: 'text.primary',
								lineHeight: 1.1,
								letterSpacing: '-0.025em',
							}}
						>
							{post.title}
						</Typography>
						<Typography
							sx={{
								fontSize: { xs: 18, md: 22 },
								color: 'text.secondary',
								lineHeight: 1.5,
								fontStyle: 'italic',
								fontWeight: 500,
							}}
						>
							"{post.excerpt}"
						</Typography>
						<Box
							sx={{
								pt: 4,
								borderTop: '1px solid',
								borderTopColor: 'divider',
								display: 'inline-flex',
								flexDirection: 'column',
								alignItems: 'center',
							}}
						>
							<Image
								src={author.photoUrl}
								alt={author.name}
								ratio="1/1"
								sx={{
									width: 48,
									flexShrink: 0,
									borderRadius: '50%',
									overflow: 'hidden',
									mb: 1.5,
									border: '4px solid',
									borderColor: 'background.default',
								}}
							/>
							<Typography
								sx={{
									fontSize: 14,
									fontWeight: 700,
									color: 'text.primary',
									textTransform: 'uppercase',
									letterSpacing: '0.05em',
								}}
							>
								{author.name}
							</Typography>
							<Typography
								sx={{
									fontSize: 12,
									color: 'text.secondary',
									mt: 0.5,
									letterSpacing: '0.08em',
									textTransform: 'uppercase',
								}}
							>
								{author.role} · {formatPostDate(post.publishedAt)}
							</Typography>
						</Box>
					</Stack>
				</Box>
			</Container>
		</Box>
	);
};

// Variant D — Cinematic. Full-bleed background image with dark gradients
// + glassmorphic chip + white headline anchored to the bottom. Reserve
// for major launches / big announcements (heavy LCP cost). Intentionally
// breaks out of the lg rail — there's no Container wrapping the hero.
const CinematicHero = ({ post }: { post: BlogPost }) => {
	const coverUrl = unsplashCover(post.coverSlug, { w: 2400, h: 1400 });

	return (
		<Box
			component="header"
			sx={{
				position: 'relative',
				width: '100%',
				minHeight: { xs: 560, md: 650, lg: '75vh' },
				display: 'flex',
				alignItems: 'flex-end',
				bgcolor: '#1F2937',
				overflow: 'hidden',
			}}
		>
			{/*
				Background cover — full-bleed `object-cover` over the parent's
				dimensions. Using a raw `<img>` here is a deliberate exception to
				the "use <Image> for content imagery" rule: the parent already
				has its own size (min-height + flex), and <Image> is built around
				ratio-driven sizing, not background-fill mode.
			*/}
			<Box
				component="img"
				src={coverUrl}
				alt={post.title}
				sx={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					objectFit: 'cover',
					zIndex: 0,
				}}
			/>
			{/* Bottom-up dark gradient (legibility) */}
			<Box
				aria-hidden="true"
				sx={{
					position: 'absolute',
					inset: 0,
					background:
						'linear-gradient(to top, rgba(31,41,55,0.95) 0%, rgba(31,41,55,0.55) 50%, transparent 100%)',
					zIndex: 1,
				}}
			/>
			{/* Left-side dark wash so the headline doesn't fight the photo */}
			<Box
				aria-hidden="true"
				sx={{
					position: 'absolute',
					inset: 0,
					width: '60%',
					background:
						'linear-gradient(to right, rgba(31,41,55,0.70), transparent)',
					zIndex: 1,
				}}
			/>
			<Container
				maxWidth="lg"
				sx={{
					position: 'relative',
					zIndex: 2,
					pb: { xs: 8, md: 12 },
					pt: { xs: 16, md: 20 },
				}}
			>
				<Box sx={{ maxWidth: 760 }}>
					<Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 4 }}>
						{/* Glass tag chip */}
						<Stack
							direction="row"
							alignItems="center"
							spacing={1}
							sx={{
								px: 1.5,
								py: 0.75,
								borderRadius: 999,
								border: '1px solid rgba(255,255,255,0.20)',
								bgcolor: 'rgba(255,255,255,0.10)',
								backdropFilter: 'blur(12px)',
								WebkitBackdropFilter: 'blur(12px)',
							}}
						>
							<Box
								sx={{
									width: 6,
									height: 6,
									borderRadius: '50%',
									bgcolor: 'primary.main',
								}}
							/>
							<Typography
								sx={{
									fontSize: 11,
									fontWeight: 600,
									letterSpacing: '0.18em',
									textTransform: 'uppercase',
									color: 'rgba(255,255,255,0.92)',
								}}
							>
								{tagLabel(post.tag)}
							</Typography>
						</Stack>
					</Stack>
					<Typography
						component="h1"
						sx={{
							fontSize: { xs: 36, md: 56, lg: 72 },
							fontWeight: 800,
							color: 'common.white',
							lineHeight: 1.05,
							letterSpacing: '-0.025em',
							mb: 5,
							textShadow: '0 2px 14px rgba(0,0,0,0.30)',
						}}
					>
						{post.title}
					</Typography>
					<HeroByline post={post} tone="dark" align="flex-start" />
				</Box>
			</Container>
		</Box>
	);
};

// ----------------------------------------------------------------------

// Dispatcher — picks one of the 4 hero treatments by `post.coverType`.
// Defaults to `above-title` when undefined to preserve old behavior.
const ArticleHero = ({ post }: { post: BlogPost }) => {
	const coverType = post.coverType ?? 'above-title';

	if (coverType === 'split') {
		return <SplitHero post={post} />;
	}
	if (coverType === 'editorial') {
		return <EditorialHero post={post} />;
	}
	if (coverType === 'cinematic') {
		return <CinematicHero post={post} />;
	}
	return <AboveTitleHero post={post} />;
};

// ----------------------------------------------------------------------

const MobileToc = ({
	tocItems,
	activeId,
}: {
	tocItems: TocItem[];
	activeId: string | null;
}) => {
	if (tocItems.length === 0) {
		return null;
	}

	return (
		<Box
			component="details"
			sx={{
				display: { xs: 'block', lg: 'none' },
				mb: 4,
				border: '1px solid',
				borderColor: 'divider',
				borderRadius: '12px',
				bgcolor: 'background.neutral',
				overflow: 'hidden',
				'& > summary': {
					listStyle: 'none',
					cursor: 'pointer',
					p: 2,
					fontSize: 14,
					fontWeight: 700,
					color: 'text.primary',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					'&::-webkit-details-marker': { display: 'none' },
				},
				'&[open] > summary .toc-chevron': {
					transform: 'rotate(180deg)',
				},
			}}
		>
			<Box component="summary">
				On this page
				<Iconify
					icon="ph:caret-down-bold"
					width={16}
					className="toc-chevron"
					sx={{ transition: 'transform 0.3s ease' }}
				/>
			</Box>
			<Box
				component="nav"
				sx={{
					display: 'flex',
					flexDirection: 'column',
					px: 2,
					pb: 2,
					pt: 1.5,
					borderTop: '1px solid',
					borderTopColor: 'divider',
					bgcolor: 'background.paper',
				}}
			>
				{tocItems.map((item) => {
					const isActive = item.id === activeId;
					return (
						<Box
							key={item.id}
							component="a"
							href={`#${item.id}`}
							sx={{
								py: 1,
								pl: item.level === 2 ? 3 : 0,
								fontSize: item.level === 2 ? 12 : 13,
								color: isActive ? 'primary.main' : 'text.secondary',
								fontWeight: isActive ? 600 : 400,
								textDecoration: 'none',
								'&:hover': { color: 'text.primary' },
							}}
						>
							{item.label}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

// Inner TOC list — extracted so the sticky aside wrapper can stack it with
// the trial + newsletter CTA cards. Renders nothing when there are no items.
const TocList = ({
	tocItems,
	activeId,
}: {
	tocItems: TocItem[];
	activeId: string | null;
}) => {
	if (tocItems.length === 0) {
		return null;
	}

	return (
		<Box>
			<Typography
				sx={{
					fontSize: 11,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.12em',
					color: 'text.secondary',
					mb: 2,
					pl: 2,
				}}
			>
				On this page
			</Typography>
			<Box
				component="nav"
				sx={{
					display: 'flex',
					flexDirection: 'column',
					borderLeft: '2px solid',
					borderLeftColor: 'divider',
				}}
			>
				{tocItems.map((item) => {
					const isActive = item.id === activeId;
					return (
						<Box
							key={item.id}
							component="a"
							href={`#${item.id}`}
							sx={{
								display: 'block',
								py: 1,
								pl: item.level === 2 ? 4 : 2,
								fontSize: item.level === 2 ? 12 : 13,
								color: isActive ? 'text.primary' : 'text.secondary',
								fontWeight: isActive ? 600 : 400,
								textDecoration: 'none',
								borderLeft: '2px solid',
								borderLeftColor: isActive ? 'primary.main' : 'transparent',
								marginLeft: '-2px', // overlap parent's left border
								transition:
									'color 240ms ease, border-color 240ms ease, font-weight 240ms ease',
								'&:hover': { color: 'text.primary' },
							}}
						>
							{item.label}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
};

// ----------------------------------------------------------------------

// Trial CTA card — dark-surface (#242424, the canon CtaBand color) with a
// subtle green radial glow at the top-right. Mirrors the article-page
// canvas's sidebar trial card; a slim, persistent conversion path that
// reads alongside the prose without demanding attention.
const AsideTrialCard = () => {
	return (
		<Box
			sx={{
				position: 'relative',
				p: 3,
				borderRadius: '16px',
				bgcolor: '#242424',
				color: 'common.white',
				overflow: 'hidden',
			}}
		>
			{/* Green radial glow accent — pure decoration, hidden under content */}
			<Box
				aria-hidden="true"
				sx={{
					position: 'absolute',
					inset: 0,
					background:
						'radial-gradient(circle at top right, rgba(16,185,129,0.18), transparent 55%)',
					pointerEvents: 'none',
				}}
			/>
			<Stack spacing={1} sx={{ position: 'relative' }}>
				<Typography
					sx={{
						fontSize: 10,
						fontWeight: 700,
						textTransform: 'uppercase',
						letterSpacing: '0.18em',
						color: 'primary.main',
					}}
				>
					Get started
				</Typography>
				<Typography
					component="p"
					sx={{ fontSize: 16, fontWeight: 700, color: 'common.white' }}
				>
					Try PublyApp free
				</Typography>
				<Typography sx={{ fontSize: 12, color: 'grey.400', lineHeight: 1.6 }}>
					14-day trial. No credit card required.
				</Typography>
				<Box
					component={RouterLink}
					href={FRONT_PATH_NAMES.auth.signup}
					sx={{
						mt: 2,
						display: 'block',
						width: '100%',
						py: 1.25,
						borderRadius: '10px',
						fontSize: 13,
						fontWeight: 700,
						textAlign: 'center',
						textDecoration: 'none',
						bgcolor: 'primary.main',
						color: 'common.white',
						boxShadow: '0 4px 14px 0 rgba(16,185,129,0.25)',
						transition: 'transform 240ms ease, box-shadow 240ms ease',
						'&:hover': {
							transform: 'translateY(-1px)',
							boxShadow: '0 8px 22px 0 rgba(16,185,129,0.35)',
						},
					}}
				>
					Start for free
				</Box>
			</Stack>
		</Box>
	);
};

// Newsletter CTA card — light-surface complement to the trial card.
// Email input is a placeholder (no backend yet); submit is a no-op.
// Keep the visual but defer wiring to a real signup endpoint.
const AsideNewsletterCard = () => {
	return (
		<Box
			sx={{
				p: 3,
				borderRadius: '16px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Stack spacing={1}>
				<Iconify
					icon="ph:envelope-bold"
					width={20}
					sx={{ color: 'primary.main' }}
				/>
				<Typography
					component="p"
					sx={{ fontSize: 16, fontWeight: 700, color: 'text.primary' }}
				>
					Get social ops insights
				</Typography>
				<Typography
					sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.6 }}
				>
					Weekly. No spam. Unsubscribe anytime.
				</Typography>
				<Box
					component="form"
					onSubmit={(e: React.FormEvent) => e.preventDefault()}
					sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}
				>
					<Box
						component="input"
						type="email"
						placeholder="Email address"
						aria-label="Email address"
						sx={{
							width: '100%',
							py: 1.25,
							px: 1.5,
							fontSize: 13,
							borderRadius: '10px',
							border: '1px solid',
							borderColor: 'divider',
							bgcolor: 'background.paper',
							color: 'text.primary',
							outline: 'none',
							transition: 'border-color 200ms ease, box-shadow 200ms ease',
							'&:focus': {
								borderColor: 'primary.main',
								boxShadow: '0 0 0 3px rgba(16,185,129,0.15)',
							},
						}}
					/>
					<Box
						component="button"
						type="submit"
						sx={{
							width: '100%',
							py: 1.25,
							borderRadius: '10px',
							fontSize: 13,
							fontWeight: 700,
							border: 'none',
							cursor: 'pointer',
							bgcolor: 'text.primary',
							color: 'background.paper',
							transition: 'opacity 200ms ease',
							'&:hover': { opacity: 0.85 },
						}}
					>
						Subscribe
					</Box>
				</Box>
			</Stack>
		</Box>
	);
};

// Desktop aside: sticky stack of TOC + trial CTA + newsletter CTA. Hidden
// under lg. The sticky boundary is the outer aside, so the whole block
// (TOC + cards) slides as one piece with the scroll.
const AsideStack = ({
	tocItems,
	activeId,
}: {
	tocItems: TocItem[];
	activeId: string | null;
}) => {
	return (
		<Box
			component="aside"
			sx={{
				display: { xs: 'none', lg: 'block' },
				position: 'sticky',
				top: 'calc(var(--layout-header-desktop-height) + 32px)',
				alignSelf: 'flex-start',
				width: 280,
				flexShrink: 0,
			}}
		>
			<Stack spacing={5}>
				<TocList tocItems={tocItems} activeId={activeId} />
				<Stack spacing={3}>
					<AsideTrialCard />
					<AsideNewsletterCard />
				</Stack>
			</Stack>
		</Box>
	);
};

// Mobile equivalent of the aside CTAs — no TOC (the MobileToc lives at the
// top of the body). Stacked between body content and ShareRow so users on
// narrow viewports still get the conversion path.
const MobileAsideCtas = () => {
	return (
		<Stack
			spacing={2.5}
			sx={{ display: { xs: 'flex', lg: 'none' }, mt: { xs: 6, md: 8 } }}
		>
			<AsideTrialCard />
			<AsideNewsletterCard />
		</Stack>
	);
};

// ----------------------------------------------------------------------

type ShareTargetId = 'x' | 'linkedin' | 'copy';

const SHARE_TARGETS: { id: ShareTargetId; label: string; icon: IconifyName }[] =
	[
		{ id: 'x', label: 'Share on X', icon: 'ph:x-logo-fill' },
		{
			id: 'linkedin',
			label: 'Share on LinkedIn',
			icon: 'ph:linkedin-logo-fill',
		},
		{ id: 'copy', label: 'Copy link', icon: 'ph:link-bold' },
	];

const buildShareUrl = (
	id: ShareTargetId,
	post: BlogPost,
	pageUrl: string,
): string => {
	const text = encodeURIComponent(post.title);
	const url = encodeURIComponent(pageUrl);

	if (id === 'x') {
		return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
	}

	if (id === 'linkedin') {
		return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
	}

	return pageUrl;
};

const ShareRow = ({ post }: { post: BlogPost }) => {
	const [copied, setCopied] = useState(false);
	// `window.location.href` isn't available during SSR. Reading it inline
	// during render produced an empty string on the server vs. a real URL
	// on the client → React hydration mismatch on the share <a href>s.
	// Initialise to '' so server + first client render agree, then fill in
	// after mount.
	const [pageUrl, setPageUrl] = useState('');
	useEffect(() => {
		setPageUrl(window.location.href);
	}, []);

	const handleClick = async (
		event: React.MouseEvent<HTMLAnchorElement>,
		id: ShareTargetId,
	) => {
		if (id === 'copy') {
			event.preventDefault();
			const ok = await copyToClipboard(pageUrl);

			if (ok) {
				setCopied(true);
				setTimeout(() => {
					return setCopied(false);
				}, 2000);
			}
		}
	};

	return (
		<Stack
			direction={{ xs: 'column', sm: 'row' }}
			alignItems="center"
			justifyContent="space-between"
			spacing={3}
			sx={{
				mt: { xs: 6, md: 8 },
				pt: { xs: 4, md: 6 },
				borderTop: '1px solid',
				borderTopColor: 'divider',
			}}
		>
			<Typography
				sx={{
					fontSize: 12,
					fontWeight: 700,
					textTransform: 'uppercase',
					letterSpacing: '0.18em',
					color: 'text.primary',
				}}
			>
				Share this article
			</Typography>
			<Stack
				direction="row"
				spacing={1.5}
				role="group"
				aria-label="Share this article"
			>
				{SHARE_TARGETS.map((target) => {
					const href =
						target.id === 'copy'
							? '#'
							: buildShareUrl(target.id, post, pageUrl);
					const isExternal = target.id !== 'copy';
					const showCopiedFeedback = target.id === 'copy' && copied;

					return (
						<Box
							key={target.id}
							component="a"
							href={href}
							target={isExternal ? '_blank' : undefined}
							rel={isExternal ? 'noopener noreferrer' : undefined}
							aria-label={target.label}
							title={showCopiedFeedback ? 'Copied!' : target.label}
							onClick={(event) => {
								return handleClick(event, target.id);
							}}
							sx={{
								width: 40,
								height: 40,
								borderRadius: '50%',
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								color: showCopiedFeedback ? 'primary.main' : 'text.secondary',
								bgcolor: showCopiedFeedback
									? 'primary.lighter'
									: 'background.paper',
								border: '1px solid',
								borderColor: 'divider',
								textDecoration: 'none',
								transition:
									'transform 240ms ease, color 240ms ease, border-color 240ms ease',
								'&:hover': {
									transform: 'translateY(-2px)',
									color: 'text.primary',
									borderColor: 'text.primary',
								},
								'&:focus-visible': {
									outline: '2px solid',
									outlineColor: 'primary.main',
									outlineOffset: '2px',
								},
							}}
						>
							<Iconify
								icon={showCopiedFeedback ? 'ph:check-bold' : target.icon}
								width={18}
							/>
						</Box>
					);
				})}
			</Stack>
		</Stack>
	);
};

// ----------------------------------------------------------------------

const AuthorBioCard = ({ post }: { post: BlogPost }) => {
	const author = BLOG_AUTHORS[post.authorId];

	return (
		<Stack
			direction={{ xs: 'column', sm: 'row' }}
			spacing={3}
			alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
			sx={{
				mt: { xs: 6, md: 8 },
				p: { xs: 4, md: 5 },
				borderRadius: '20px',
				bgcolor: 'background.neutral',
				border: '1px solid',
				borderColor: 'divider',
			}}
		>
			<Image
				src={author.photoUrl}
				alt={author.name}
				ratio="1/1"
				sx={{
					width: 64,
					flexShrink: 0,
					borderRadius: '50%',
					overflow: 'hidden',
					bgcolor: 'background.paper',
					border: '2px solid',
					borderColor: 'background.paper',
					boxShadow: '0 2px 8px rgba(17,24,39,0.06)',
				}}
			/>
			<Box>
				<Typography
					sx={{ fontSize: 18, fontWeight: 700, color: 'text.primary' }}
				>
					{author.name}
				</Typography>
				<Typography sx={{ fontSize: 14, color: 'text.secondary', mb: 2 }}>
					{author.role}
				</Typography>
				<Typography
					sx={{
						fontSize: 14,
						color: 'text.primary',
						lineHeight: 1.6,
						opacity: 0.8,
					}}
				>
					{author.name.split(' ')[0]} writes about engineering, ops, and the
					lessons learned shipping PublyApp to thousands of operators.
				</Typography>
			</Box>
		</Stack>
	);
};

// ----------------------------------------------------------------------

const ContinueReading = ({ post }: { post: BlogPost }) => {
	const related = getPublishedPosts()
		.filter((p) => {
			return p.tag === post.tag && p.slug !== post.slug;
		})
		.slice(0, 3);

	if (related.length === 0) {
		return null;
	}

	return (
		<Box
			component="section"
			sx={{
				py: { xs: 8, md: 12 },
			}}
		>
			<Container maxWidth="lg">
				<Typography
					component="h2"
					sx={{
						fontSize: { xs: 24, md: 28 },
						fontWeight: 700,
						color: 'text.primary',
						textAlign: 'center',
						mb: { xs: 5, md: 6 },
						letterSpacing: '-0.01em',
					}}
				>
					Continue reading
				</Typography>
				{/*
					Grid is always 3 columns on md+ regardless of `related.length`.
					Earlier the column count tracked the post count, which made a
					single related post stretch full-width — visually ugly and broke
					the index-grid rhythm. With repeat(3,1fr), 1 or 2 related posts
					occupy 1 or 2 cells of a 3-up row.
				*/}
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							md: 'repeat(3, 1fr)',
						},
						gap: 3,
					}}
				>
					{related.map((p) => {
						return <BlogPostCard key={p.slug} post={p} variant="standard" />;
					})}
				</Box>
			</Container>
		</Box>
	);
};

// ----------------------------------------------------------------------

export const BlogArticlePage = ({
	post,
	tocItems,
	children,
}: BlogArticlePageProps) => {
	const tocIds = useMemo(() => {
		return tocItems.map((item) => {
			return item.id;
		});
	}, [tocItems]);
	const activeId = useActiveTocSection({
		ids: tocIds,
		rootMargin: '-120px 0px -65% 0px',
	});

	return (
		<Box component="article">
			<ArticleHero post={post} />

			{/*
				Body sits inside the same lg rail as the topbar/footer/CtaBand.
				The inner prose column caps at 760px so the line length stays
				readable even when the lg rail is wider than the prose + sidebar
				combined (between md and lg breakpoints the sidebar is hidden,
				so without a cap the prose would stretch the full container).
			*/}
			<Container
				maxWidth="lg"
				sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 4, md: 6 } }}
			>
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', lg: 'row' },
						gap: { xs: 0, lg: 8 },
						alignItems: 'flex-start',
						justifyContent: 'center',
					}}
				>
					<Box sx={{ flex: 1, minWidth: 0, maxWidth: { xs: '100%', lg: 760 } }}>
						<MobileToc tocItems={tocItems} activeId={activeId} />
						{children}
						<MobileAsideCtas />
						<ShareRow post={post} />
						<AuthorBioCard post={post} />
					</Box>
					<AsideStack tocItems={tocItems} activeId={activeId} />
				</Box>
			</Container>

			<ContinueReading post={post} />

			<CtaBand
				eyebrowLabel="Ready to ship faster?"
				title={'Try PublyApp free\nfor 14 days'}
				subhead="Put your social execution on autopilot and turn your audience into actual advocates."
				ctaLabel="Start for Free"
				ctaHref={FRONT_PATH_NAMES.auth.signup}
				microcopy="No credit card required. Setup in minutes."
			/>
		</Box>
	);
};
