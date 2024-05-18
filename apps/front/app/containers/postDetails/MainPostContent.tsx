import { /* Chip, */ Chip, Container, Stack, Typography } from '@mui/material';
import { useLoaderData, useRevalidator } from '@remix-run/react';

import Breadcrumbs from '@/front/components/Breadcrumbs';
import CompactContainer from '@/front/components/CompactContainer';
import Error404 from '@/front/components/Error404';
import Error500 from '@/front/components/Error500';
import Markdown from '@/front/components/Markdown';
import Retry from '@/front/components/Retry';
import useTranslate from '@/front/hooks/useTranslate';
import { isErrorJSON } from '@/front/lib/remix/safelyRun';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';

import type { SinglePostLoaderFunction } from '../../routes/posts.$slug';

import PostDetailsHero from './components/PostDetailsHero';

const MainPostContent = () => {
	const data = useLoaderData<SinglePostLoaderFunction>();
	const { post, relatedPosts } = data;
	const { t } = useTranslate();
	const { revalidate, state } = useRevalidator();

	// if (!post) { // improbable + we don't handle this here, bun in the root route error boundary.
	// 	return <h1>Post does not exist</h1>; // improbable
	// }

	if (isErrorJSON(post)) {
		const error = post;
		const message = error.message || t('an-error-occurred');

		if (isErrorJSON(relatedPosts)) {
			console.log(relatedPosts);
			return (
				<CompactContainer>
					<Error500 error={new Error(relatedPosts.message)} />
				</CompactContainer>
			);
		}

		return (
			<Retry
				message={message}
				onRetry={() => {
					revalidate();
				}}
				loading={state === 'loading'}
			/>
		);
	}

	const renderPost = () => {
		let message: string = t('an-error-occurred');

		if (post.status === 'E_NOT_FOUND') {
			message = t('item-not-found', { item: t('post') });
			return (
				<CompactContainer>
					<Error404 />
				</CompactContainer>
			);
		}

		if (post.status === 'E_NOT_TRANSLATED') {
			message = t('item-not-found', { item: t('translation') });

			return (
				<Retry message={message} hideRetryButton>
					<h1>Lol</h1>
				</Retry>
			);
		}

		const iPost = post.post;

		return (
			<>
				<PostDetailsHero
					title={iPost.title}
					// author={iPost.author}
					coverUrl={iPost.cover?.url || ''}
					createdAt={iPost.createdAt}
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
								name: iPost?.title,
							},
						]}
						sx={{ maxWidth: 720, mx: 'auto' }}
					/>
				</Container>

				<Container maxWidth={false}>
					<Stack sx={{ maxWidth: 720, mx: 'auto' }}>
						<Typography variant="subtitle1" sx={{ mb: 5 }}>
							{iPost.description}
						</Typography>

						<Stack
							spacing={3}
							sx={{
								py: 3,
								mb: 5,
								borderTop: (theme) => {
									return `dashed 1px ${theme.palette.divider}`;
								},
								borderBottom: (theme) => {
									return `dashed 1px ${theme.palette.divider}`;
								},
							}}
						>
							<Stack direction="row" flexWrap="wrap" spacing={1}>
								{iPost.tags?.map((tag) => {
									return <Chip key={tag} label={tag} variant="soft" />;
								})}
							</Stack>

							{/* <Stack direction="row" alignItems="center">
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
								label={fShortenNumber(iPost.totalFavorites)}
								sx={{ mr: 1 }}
							/>
							<AvatarGroup>
								{iPost.favoritePerson.map((person) => {
									return <Avatar key={person.name} alt={person.name} src={person.avatarUrl} />;
								})}
							</AvatarGroup>
						</Stack> */}
						</Stack>

						<Markdown
							sx={{
								mb: 12,
							}}
						>
							{iPost.content}
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
							</AvatarGroup>
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
	};

	// eslint-disable-next-line react/jsx-no-useless-fragment
	return <>{renderPost()}</>;
};

export default MainPostContent;
