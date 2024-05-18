import { Container } from '@mui/material';
import { useLoaderData, useRevalidator } from '@remix-run/react';

import Retry from '@/front/components/Retry';
import useTranslate from '@/front/hooks/useTranslate';
import { isErrorJSON } from '@/front/lib/remix/safelyRun';

import type { SinglePostLoaderFunction } from '../../routes/posts.$slug';

import MorePostList from './components/MorePostList';

const RelatedPosts = () => {
	const data = useLoaderData<SinglePostLoaderFunction>();
	const { relatedPosts: posts, post: mainPost } = data;
	const { t } = useTranslate();
	const { revalidate, state } = useRevalidator();

	if (isErrorJSON(posts)) {
		const error = posts;
		const message = error.message || t('an-error-occurred');

		if (isErrorJSON(mainPost)) {
			// const mainError = mainPost;
			return null;
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

	return <Container sx={{ pb: 15 }}>{!!posts.length && <MorePostList posts={posts} />}</Container>;
};

export default RelatedPosts;
