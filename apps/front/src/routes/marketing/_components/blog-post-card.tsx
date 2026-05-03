import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Image } from '#app/components/image/image.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { MarketingEyebrow } from '#app/routes/marketing/_components/marketing-eyebrow.tsx';
import {
	BLOG_AUTHORS,
	type BlogPost,
	BLOG_TAGS,
	unsplashCover,
} from '#app/routes/marketing/_data/blog.ts';

// ----------------------------------------------------------------------

type BlogPostCardVariant = 'standard' | 'featured' | 'compact';

type BlogPostCardProps = {
	post: BlogPost;
	variant?: BlogPostCardVariant;
};

// ----------------------------------------------------------------------

// Cover dimensions per variant. The <Image ratio="..."> prop drives the
// rendered aspect; the URL `w`/`h` ensures we don't fetch a 1600px hero
// for a 200px thumbnail.
const COVER_PRESETS: Record<
	BlogPostCardVariant,
	{ ratio: '16/9' | '2/1' | '1/1'; w: number; h: number }
> = {
	standard: { ratio: '16/9', w: 600, h: 338 },
	featured: { ratio: '2/1', w: 1080, h: 540 },
	compact: { ratio: '1/1', w: 200, h: 200 },
};

// ----------------------------------------------------------------------

const formatPostDate = (iso: string): string => {
	return new Date(iso).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
};

const tagLabel = (value: BlogPost['tag']): string => {
	return BLOG_TAGS.find((t) => t.value === value)?.label ?? value;
};

// ----------------------------------------------------------------------

const ByLine = ({
	post,
	avatarSize = 32,
	titleSize = 13,
	roleSize = 12,
}: {
	post: BlogPost;
	avatarSize?: number;
	titleSize?: number;
	roleSize?: number;
}) => {
	const author = BLOG_AUTHORS[post.authorId];

	return (
		<Stack direction="row" spacing={1.5} alignItems="center">
			<Box
				component="img"
				src={author.photoUrl}
				alt={author.name}
				loading="lazy"
				sx={{
					width: avatarSize,
					height: avatarSize,
					borderRadius: '50%',
					objectFit: 'cover',
					bgcolor: 'background.neutral',
					flexShrink: 0,
				}}
			/>
			<Stack spacing={0}>
				<Typography
					sx={{ fontSize: titleSize, fontWeight: 700, color: 'text.primary' }}
				>
					{author.name}
				</Typography>
				<Typography sx={{ fontSize: roleSize, color: 'text.secondary' }}>
					{author.role}
				</Typography>
			</Stack>
		</Stack>
	);
};

const DateAndReadingTime = ({ post, sx }: { post: BlogPost; sx?: object }) => {
	return (
		<Stack
			direction="row"
			spacing={1}
			alignItems="center"
			sx={{ fontSize: 12, color: 'text.secondary', ...sx }}
		>
			<Box component="span">{formatPostDate(post.publishedAt)}</Box>
			<Box component="span" aria-hidden="true">
				·
			</Box>
			<Box component="span">{post.readingMinutes} min read</Box>
		</Stack>
	);
};

// ----------------------------------------------------------------------

export const BlogPostCard = ({
	post,
	variant = 'standard',
}: BlogPostCardProps) => {
	const cover = COVER_PRESETS[variant];
	const coverUrl = unsplashCover(post.coverSlug, { w: cover.w, h: cover.h });

	if (variant === 'featured') {
		return (
			<Box
				component={RouterLink}
				href={`/blog/${post.slug}`}
				sx={{
					display: 'grid',
					gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
					gap: { xs: 3, md: 5 },
					alignItems: 'center',
					p: { xs: 3, md: 4 },
					borderRadius: '24px',
					bgcolor: 'background.paper',
					border: '1px solid',
					borderColor: 'divider',
					textDecoration: 'none',
					color: 'inherit',
					transition: 'transform 240ms ease, box-shadow 240ms ease',
					'&:hover': {
						transform: 'translateY(-2px)',
						boxShadow: '0 20px 40px -16px rgba(17,24,39,0.12)',
					},
				}}
			>
				<Image
					src={coverUrl}
					alt={post.title}
					ratio={cover.ratio}
					sx={{ borderRadius: '16px', overflow: 'hidden' }}
				/>
				<Stack spacing={2.5} alignItems="flex-start">
					<MarketingEyebrow label={tagLabel(post.tag)} />
					<Typography
						component="h3"
						sx={{
							fontSize: { xs: 24, md: 32 },
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.2,
							letterSpacing: '-0.01em',
						}}
					>
						{post.title}
					</Typography>
					<Typography
						sx={{ fontSize: 16, color: 'text.secondary', lineHeight: 1.6 }}
					>
						{post.excerpt}
					</Typography>
					<Stack spacing={1}>
						<ByLine post={post} avatarSize={40} titleSize={14} roleSize={13} />
						<DateAndReadingTime post={post} />
					</Stack>
				</Stack>
			</Box>
		);
	}

	if (variant === 'compact') {
		return (
			<Box
				component={RouterLink}
				href={`/blog/${post.slug}`}
				sx={{
					display: 'flex',
					gap: 2,
					alignItems: 'center',
					p: 2,
					borderRadius: '12px',
					textDecoration: 'none',
					color: 'inherit',
					transition: 'background-color 240ms ease',
					'&:hover': { bgcolor: 'background.neutral' },
				}}
			>
				<Image
					src={coverUrl}
					alt={post.title}
					ratio={cover.ratio}
					sx={{
						width: 64,
						flexShrink: 0,
						borderRadius: '8px',
						overflow: 'hidden',
					}}
				/>
				<Stack spacing={0.5} sx={{ minWidth: 0 }}>
					<Typography
						sx={{
							fontSize: 13,
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.3,
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
						}}
					>
						{post.title}
					</Typography>
					<DateAndReadingTime post={post} sx={{ fontSize: 11 }} />
				</Stack>
			</Box>
		);
	}

	// standard
	return (
		<Box
			component={RouterLink}
			href={`/blog/${post.slug}`}
			sx={{
				display: 'flex',
				flexDirection: 'column',
				borderRadius: '20px',
				bgcolor: 'background.paper',
				border: '1px solid',
				borderColor: 'divider',
				overflow: 'hidden',
				textDecoration: 'none',
				color: 'inherit',
				transition: 'transform 240ms ease, box-shadow 240ms ease',
				'&:hover': {
					transform: 'translateY(-4px)',
					boxShadow: '0 20px 40px -16px rgba(17,24,39,0.12)',
				},
			}}
		>
			<Image src={coverUrl} alt={post.title} ratio={cover.ratio} />
			<Stack
				spacing={2}
				alignItems="flex-start"
				sx={{ p: 3, flex: 1, justifyContent: 'space-between' }}
			>
				<Stack spacing={2} alignItems="flex-start">
					<MarketingEyebrow label={tagLabel(post.tag)} />
					<Typography
						component="h3"
						sx={{
							fontSize: 20,
							fontWeight: 700,
							color: 'text.primary',
							lineHeight: 1.3,
							letterSpacing: '-0.01em',
						}}
					>
						{post.title}
					</Typography>
					<Typography
						sx={{
							fontSize: 14,
							color: 'text.secondary',
							lineHeight: 1.6,
							display: '-webkit-box',
							WebkitLineClamp: 3,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
						}}
					>
						{post.excerpt}
					</Typography>
				</Stack>
				<Stack spacing={1} sx={{ width: '100%' }}>
					<ByLine post={post} />
					<DateAndReadingTime post={post} />
				</Stack>
			</Stack>
		</Box>
	);
};
