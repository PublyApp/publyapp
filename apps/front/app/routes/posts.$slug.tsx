import { Button, Chip, Container, Stack, Typography } from '@mui/material';
import type { LoaderFunction } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import _ from 'lodash';

import EmptyContent from '@devist/ui-react/components/EmptyContent';
import Iconify from '@devist/ui-react/components/Iconify';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import parseApi from '@/ui-react/api/parse/ParseApi';

import Breadcrumbs from '../components/Breadcrumbs';
import Markdown from '../components/Markdown';
import RouterLink from '../components/RouterLink';
import PostDetailsHero from '../containers/postDetails/PostDetailsHero';
import PostDetailsSkeleton from '../containers/postDetails/PostDetailsSkeleton';
import { safelyRunInLoader } from '../lib/remix/safelyRun';

export const loader = (async ({ params }) => {
	const slug = _.toString(params.slug);
	const result = await safelyRunInLoader(parseApi.posts.getPostDetailFront)({ slug });
	return result;
}) satisfies LoaderFunction;

const PostDetailsPage = () => {
	const result = useLoaderData<typeof loader>();

	const renderSkeleton = <PostDetailsSkeleton />;

	const renderError = (
		<Container sx={{ my: 10 }}>
			<EmptyContent
				filled
				// title={`${postError?.message}`}
				title="Post not found"
				action={
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.posts.root}
						startIcon={<Iconify icon="eva:arrow-ios-back-fill" width={16} />}
						sx={{ mt: 3 }}
					>
						Back to List
					</Button>
				}
				sx={{ py: 10 }}
			/>
		</Container>
	);

	const renderPost = _.isError(result) ? (
		<h1
			css={{
				color: 'red',
			}}
		>
			Error
		</h1>
	) : (
		<>
			<PostDetailsHero
				title={result.post.title}
				author={post.author}
				coverUrl={post.coverUrl}
				createdAt={post.createdAt}
			/>

			<Container
				maxWidth={false}
				sx={{
					py: 3,
					mb: 5,
					borderBottom: (theme) => {
						return `solid 1px ${theme.palette.divider}`;
					},
				}}
			>
				<Breadcrumbs
					links={[
						{
							name: 'Home',
							href: '/',
						},
						{
							name: 'Blog',
							href: FRONT_PATH_NAMES.posts.root,
						},
						{
							name: post?.title,
						},
					]}
					sx={{ maxWidth: 720, mx: 'auto' }}
				/>
			</Container>

			<Container maxWidth={false}>
				<Stack sx={{ maxWidth: 720, mx: 'auto' }}>
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
							{/* <FormControlLabel
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
							/> */}

							{/* <AvatarGroup>
								{post.favoritePerson.map((person) => {
									return <Avatar key={person.name} alt={person.name} src={person.avatarUrl} />;
								})}
							</AvatarGroup> */}
						</Stack>
					</Stack>

					<Stack direction="row" sx={{ mb: 3, mt: 5 }}>
						<Typography variant="h4">Comments</Typography>

						<Typography variant="subtitle2" sx={{ color: 'text.disabled' }}>
							({post.comments.length})
						</Typography>
					</Stack>

					{/* <PostCommentForm /> */}

					{/* <Divider sx={{ mt: 5, mb: 2 }} /> */}

					{/* <PostCommentList comments={post.comments} /> */}
				</Stack>
			</Container>
		</>
	);

	const renderLatestPosts = (
		<>
			<Typography variant="h4" sx={{ mb: 5 }}>
				Recent Posts
			</Typography>

			<PostList posts={latestPosts.slice(latestPosts.length - 4)} loading={latestPostsLoading} disabledIndex />
		</>
	);

	return (
		<>
			{postLoading && renderSkeleton}

			{postError && renderError}

			{post && renderPost}

			<Container sx={{ pb: 15 }}>{!!latestPosts.length && renderLatestPosts}</Container>
		</>
	);
};

export default PostDetailsPage;
