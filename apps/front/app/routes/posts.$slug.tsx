// import fs from 'fs';

import { Chip, Container, Stack, Typography } from '@mui/material';
import type { LoaderFunction } from '@remix-run/node';
import {
	// isRouteErrorResponse,
	useLoaderData,
	// useRouteError
} from '@remix-run/react';
import _ from 'lodash';

// import EmptyContent from '@devist/ui-react/components/EmptyContent';
// import Iconify from '@devist/ui-react/components/Iconify';

import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

// import parseApi from '@/ui-react/api/parse/ParseApi';

import Breadcrumbs from '../components/Breadcrumbs';
import Markdown from '../components/Markdown';
// import RouterLink from '../components/RouterLink';
import PostDetailsHero from '../containers/postDetails/PostDetailsHero';
import { getServerLoader } from '../lib/remix/getServerLoader';
import { isErrorJSON, safelyRunInLoader } from '../lib/remix/safelyRun';

// import PostDetailsSkeleton from '../containers/postDetails/PostDetailsSkeleton';
// import { safelyRunInLoader } from '../lib/remix/safelyRun';

// eslint-disable-next-line consistent-return
export const loader = getServerLoader(async ({ params, parseApi }) => {
	const slug = _.toString(params.slug);

	const postPromise = safelyRunInLoader(parseApi.posts.getPostDetailFront)({ slug });
	const relatedPostsPromise = safelyRunInLoader(parseApi.posts.getRelatedPostsFrontDetails)({ slug });

	const [post, relatedPosts] = await Promise.all([postPromise, relatedPostsPromise]);
	// const post = await postPromise;

	// fs.writeFileSync('test.json', JSON.stringify(post, null, 2));
	return {
		post,
		relatedPosts,
	};
}) satisfies LoaderFunction;

const PostDetailsPage = () => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const { post: _post /* , relatedPosts */ } = useLoaderData<typeof loader>();
	const post = _post ?? {};
	// console.log(data);
	// const post = {};

	// const renderSkeleton = <PostDetailsSkeleton />;

	// const renderError = (
	// 	<Container sx={{ my: 10 }}>
	// 		<EmptyContent
	// 			filled
	// 			// title={`${postError?.message}`}
	// 			title="Post not found"
	// 			action={
	// 				<Button
	// 					component={RouterLink}
	// 					href={FRONT_PATH_NAMES.posts.root}
	// 					startIcon={<Iconify icon="eva:arrow-ios-back-fill" width={16} />}
	// 					sx={{ mt: 3 }}
	// 				>
	// 					Back to List
	// 				</Button>
	// 			}
	// 			sx={{ py: 10 }}
	// 		/>
	// 	</Container>
	// );

	const renderPost = isErrorJSON(post) ? (
		<>
			<h1 css={{ color: 'red' }}>Error while getting post</h1>
			<pre>{JSON.stringify(post, null, 2)}</pre>
		</>
	) : (
		<>
			<PostDetailsHero
				title={post.title}
				// author={post.author}
				coverUrl={post.cover?.url || ''}
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

					<Markdown /* children={} */>{post.content}</Markdown>

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
							{post.tags?.map((tag) => {
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

					{/* <Stack direction="row" sx={{ mb: 3, mt: 5 }}>
						<Typography variant="h4">Comments</Typography>

						<Typography variant="subtitle2" sx={{ color: 'text.disabled' }}>
							({post.comments.length})
						</Typography>
					</Stack> */}

					{/* <PostCommentForm /> */}

					{/* <Divider sx={{ mt: 5, mb: 2 }} /> */}

					{/* <PostCommentList comments={post.comments} /> */}
				</Stack>
			</Container>
		</>
	);

	// const renderLatestPosts = (
	// 	<>
	// 		<Typography variant="h4" sx={{ mb: 5 }}>
	// 			Recent Posts
	// 		</Typography>

	// 		<PostList posts={latestPosts.slice(latestPosts.length - 4)} loading={latestPostsLoading} disabledIndex />
	// 	</>
	// );

	// const renderRelatedPosts = <RelatedPosts />;

	return (
		<>
			{/* {postLoading && renderSkeleton} */}

			{/* {postError && renderError} */}

			{/* {post && renderPost} */}
			{renderPost}

			{/* <Container sx={{ pb: 15 }}>{!!latestPosts.length && renderLatestPosts}</Container> */}
		</>
	);
};

export default PostDetailsPage;

// export const ErrorBoundary = () => {
// 	const error = useRouteError();

// 	// When NODE_ENV=production:
// 	// error.message = "Unexpected Server Error"
// 	// error.stack = undefined
// 	const renderErrorNotFound = (
// 		<Container sx={{ my: 10 }}>
// 			<EmptyContent
// 				filled
// 				// title={`${postError?.message}`}
// 				title="Post not found"
// 				action={
// 					<Button
// 						component={RouterLink}
// 						href={FRONT_PATH_NAMES.posts.root}
// 						startIcon={<Iconify icon="eva:arrow-ios-back-fill" width={16} />}
// 						sx={{ mt: 3 }}
// 					>
// 						Back to List
// 					</Button>
// 				}
// 				sx={{ py: 10 }}
// 			/>
// 		</Container>
// 	);

// 	if (isRouteErrorResponse(error)) {
// 		// error.status = 500
// 		// error.data = "Oh no! Something went wrong!"
// 		if (error.status === 404) {
// 			return renderErrorNotFound;
// 		}
// 	}

// 	return (
// 		<>
// 			{/* {renderError} */}
// 			{/* <RelatedPosts /> */}
// 		</>
// 	);
// };
