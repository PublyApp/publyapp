import { useCallback, useEffect, useState } from 'react';

import Avatar from '@mui/material/Avatar';
import AvatarGroup, { avatarGroupClasses } from '@mui/material/AvatarGroup';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
// @mui
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
// _mock
import { POST_PUBLISH_OPTIONS } from 'src/_mock';
// api
import { useGetPost } from 'src/api/blog';
import EmptyContent from 'src/components/empty-content';
// components
import Iconify from 'src/components/iconify';
import Markdown from 'src/components/markdown';
import { RouterLink } from 'src/routes/components';
// routes
import { paths } from 'src/routes/paths';
// utils
import { fShortenNumber } from 'src/utils/format-number';

import PostCommentForm from '../post-comment-form';
import PostCommentList from '../post-comment-list';
//
import PostDetailsHero from '../post-details-hero';
import PostDetailsToolbar from '../post-details-toolbar';
import { PostDetailsSkeleton } from '../post-skeleton';

// ----------------------------------------------------------------------

type Props = {
	title: string;
};

const PostDetailsView = ({ title }: Props) => {
	const [publish, setPublish] = useState('');

	const { post, postLoading, postError } = useGetPost(title);

	const handleChangePublish = useCallback((newValue: string) => {
		setPublish(newValue);
	}, []);

	useEffect(() => {
		if (post) {
			setPublish(post?.publish);
		}
	}, [post]);

	const renderSkeleton = <PostDetailsSkeleton />;

	const renderError = (
		<EmptyContent
			filled
			title={`${postError?.message}`}
			action={
				<Button
					component={RouterLink}
					href={paths.dashboard.post.root}
					startIcon={<Iconify icon="eva:arrow-ios-back-fill" width={16} />}
					sx={{ mt: 3 }}
				>
					Back to List
				</Button>
			}
			sx={{
				py: 20,
			}}
		/>
	);

	const renderPost = post && (
		<>
			<PostDetailsToolbar
				backLink={paths.dashboard.post.root}
				editLink={paths.dashboard.post.edit(`${post?.title}`)}
				liveLink={paths.post.details(`${post?.title}`)}
				publish={publish || ''}
				onChangePublish={handleChangePublish}
				publishOptions={POST_PUBLISH_OPTIONS}
			/>

			<PostDetailsHero title={post.title} coverUrl={post.coverUrl} />

			<Stack
				sx={{
					maxWidth: 720,
					mx: 'auto',
					mt: { xs: 5, md: 10 },
				}}
			>
				<Typography variant="subtitle1" sx={{ mb: 5 }}>
					{post.description}
				</Typography>

				<Markdown children={post.content} />

				<Stack
					spacing={3}
					sx={{
						py: 3,
						borderTop: (theme) => {
							return `dashed 1px ${theme.palette.divider}`;
						},
						borderBottom: (theme) => {
							return `dashed 1px ${theme.palette.divider}`;
						},
					}}
				>
					<Stack direction="row" flexWrap="wrap" spacing={1}>
						{post.tags.map((tag) => {
							return <Chip key={tag} label={tag} variant="soft" />;
						})}
					</Stack>

					<Stack direction="row" alignItems="center">
						<FormControlLabel
							control={
								<Checkbox
									defaultChecked
									size="small"
									color="error"
									icon={<Iconify icon="solar:heart-bold" />}
									checkedIcon={<Iconify icon="solar:heart-bold" />}
								/>
							}
							label={fShortenNumber(post.totalFavorites)}
							sx={{ mr: 1 }}
						/>

						<AvatarGroup
							sx={{
								[`& .${avatarGroupClasses.avatar}`]: {
									width: 32,
									height: 32,
								},
							}}
						>
							{post.favoritePerson.map((person) => {
								return <Avatar key={person.name} alt={person.name} src={person.avatarUrl} />;
							})}
						</AvatarGroup>
					</Stack>
				</Stack>

				<Stack direction="row" sx={{ mb: 3, mt: 5 }}>
					<Typography variant="h4">Comments</Typography>

					<Typography variant="subtitle2" sx={{ color: 'text.disabled' }}>
						({post.comments.length})
					</Typography>
				</Stack>

				<PostCommentForm />

				<Divider sx={{ mt: 5, mb: 2 }} />

				<PostCommentList comments={post.comments} />
			</Stack>
		</>
	);

	return (
		<Container maxWidth={false}>
			{postLoading && renderSkeleton}

			{postError && renderError}

			{post && renderPost}
		</Container>
	);
};

export default PostDetailsView;
