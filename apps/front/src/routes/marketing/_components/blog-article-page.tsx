import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import type { IconifyName } from '#app/components/iconify/register-icons.ts';
import { Image } from '#app/components/image/image.tsx';
import { useActiveTocSection } from '#app/hooks/use-active-toc-section.ts';
import { BlogPostCard } from '#app/routes/marketing/_components/blog-post-card.tsx';
import { CtaBand } from '#app/routes/marketing/_components/cta-band.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import {
	BLOG_AUTHORS,
	type BlogPost,
	BLOG_POSTS,
	BLOG_TAGS,
	unsplashCover,
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

const ArticleHero = ({ post }: { post: BlogPost }) => {
	const author = BLOG_AUTHORS[post.authorId];
	const coverUrl = unsplashCover(post.coverSlug, { w: 1600, h: 900 });

	return (
		<Box component="header" sx={{ pt: { xs: 8, md: 14 } }}>
			<Container maxWidth="md">
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
					<Stack
						direction="row"
						spacing={1.5}
						alignItems="center"
						sx={{ flexWrap: 'wrap', justifyContent: 'center' }}
					>
						<Box
							component="img"
							src={author.photoUrl}
							alt={author.name}
							loading="lazy"
							sx={{
								width: 32,
								height: 32,
								borderRadius: '50%',
								objectFit: 'cover',
								bgcolor: 'background.neutral',
							}}
						/>
						<Typography
							sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}
						>
							{author.name}
						</Typography>
						<Box component="span" aria-hidden="true" sx={{ color: 'divider' }}>
							·
						</Box>
						<Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
							{author.role}
						</Typography>
						<Box
							component="span"
							aria-hidden="true"
							sx={{
								color: 'divider',
								display: { xs: 'none', sm: 'inline' },
							}}
						>
							·
						</Box>
						<Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
							{formatPostDate(post.publishedAt)}
						</Typography>
						<Box
							component="span"
							aria-hidden="true"
							sx={{
								color: 'divider',
								display: { xs: 'none', sm: 'inline' },
							}}
						>
							·
						</Box>
						<Stack
							direction="row"
							spacing={0.5}
							alignItems="center"
							sx={{ fontSize: 14, color: 'text.secondary' }}
						>
							<Iconify icon="ph:clock-bold" width={14} />
							<Box component="span">{post.readingMinutes} min read</Box>
						</Stack>
					</Stack>
				</Stack>
			</Container>

			{/* Cover at reading-column width (max-w-3xl ~768px) */}
			<Container maxWidth="md" sx={{ mt: { xs: 6, md: 10 } }}>
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

const DesktopTocSidebar = ({
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
			component="aside"
			sx={{
				display: { xs: 'none', lg: 'block' },
				position: 'sticky',
				top: 'calc(var(--layout-header-desktop-height) + 32px)',
				alignSelf: 'flex-start',
				width: 240,
				flexShrink: 0,
			}}
		>
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

const copyToClipboard = async (text: string): Promise<boolean> => {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall through to prompt fallback
		}
	}

	if (typeof window !== 'undefined') {
		window.prompt('Copy this URL', text);
		return true;
	}

	return false;
};

const ShareRow = ({ post }: { post: BlogPost }) => {
	const [copied, setCopied] = useState(false);

	const handleClick = async (
		event: React.MouseEvent<HTMLAnchorElement>,
		id: ShareTargetId,
	) => {
		if (id === 'copy') {
			event.preventDefault();
			const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
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
					const pageUrl =
						typeof window !== 'undefined' ? window.location.href : '';
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
			<Box
				component="img"
				src={author.photoUrl}
				alt={author.name}
				loading="lazy"
				sx={{
					width: 64,
					height: 64,
					borderRadius: '50%',
					objectFit: 'cover',
					bgcolor: 'background.paper',
					border: '2px solid',
					borderColor: 'background.paper',
					boxShadow: '0 2px 8px rgba(17,24,39,0.06)',
					flexShrink: 0,
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
	const related = BLOG_POSTS.filter((p) => {
		return p.tag === post.tag && p.slug !== post.slug;
	}).slice(0, 3);

	if (related.length === 0) {
		return null;
	}

	return (
		<Box
			component="section"
			sx={{
				py: { xs: 8, md: 12 },
				borderTop: '1px solid',
				borderTopColor: 'divider',
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
				<Box
					sx={{
						display: 'grid',
						gridTemplateColumns: {
							xs: '1fr',
							sm: 'repeat(2, 1fr)',
							md: `repeat(${related.length}, 1fr)`,
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

			{/* 2-col body row: body left, sticky TOC sidebar right (lg+) */}
			<Container
				maxWidth="md"
				sx={{ pt: { xs: 6, md: 10 }, pb: { xs: 4, md: 6 } }}
			>
				<Box
					sx={{
						display: 'flex',
						flexDirection: { xs: 'column', lg: 'row' },
						gap: { xs: 0, lg: 8 },
						alignItems: 'flex-start',
					}}
				>
					<Box sx={{ flex: 1, minWidth: 0, width: 1 }}>
						<MobileToc tocItems={tocItems} activeId={activeId} />
						{children}
						<ShareRow post={post} />
						<AuthorBioCard post={post} />
					</Box>
					<DesktopTocSidebar tocItems={tocItems} activeId={activeId} />
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
