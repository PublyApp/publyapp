import { /* Chip, */ Container, Stack, Typography } from '@mui/material';
import { useLoaderData } from '@remix-run/react';
import _ from 'lodash';

import Breadcrumbs from '@/front/components/Breadcrumbs';
import Markdown from '@/front/components/Markdown';
import { isErrorJSON } from '@/front/lib/remix/safelyRun';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import useTranslate from '@/ui-react/hooks/useTranslate';

import type { SinglePostLoaderFunction } from '../../routes/posts.$slug';

import PostDetailsHero from './components/PostDetailsHero';

const MainPostContent = () => {
	const data = useLoaderData<SinglePostLoaderFunction>();
	const { post } = data;
	const { t } = useTranslate();

	// if (!post) { // improbable + we don't handle this here, bun in the root route error boundary.
	// 	return <h1>Post does not exist</h1>; // improbable
	// }

	if (isErrorJSON(post)) {
		const error = post;
		const message = error.message ?? 'An error ocurred';
		let description = 'Try again later';

		if (message === t('item-not-found', { item: t('post') })) {
			// return <h1>{error.message}</h1>;
			description = 'The post you are looking for does not exist';
		}

		if (message === t('item-not-found', { item: t('translation') })) {
			// return <h1>{error.message}</h1>;
			description = t('item-not-translated', { item: _.toLower(t('post')) });
		}

		return (
			<Container
				maxWidth="lg"
				sx={{
					py: 3,
					mb: 5,
					// borderBottom: (theme) => {
					// 	return `solid 1px ${theme.palette.divider}`;
					// },
				}}
			>
				<h1>{message}</h1>
				<p>{description}</p>
			</Container>
		);
	}

	const renderPost = (
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

					<Markdown
						/* children={} */ sx={{
							mb: 12,
						}}
					>
						{post.content}
					</Markdown>

					{/* <Stack
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
<AvatarGroup>
								{post.favoritePerson.map((person) => {
									return <Avatar key={person.name} alt={person.name} src={person.avatarUrl} />;
								})}
							</A
							vatarGroup>
						</Stack>
					</Stack> */}

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

	// eslint-disable-next-line react/jsx-no-useless-fragment
	return <>{renderPost}</>;
};

export default MainPostContent;
