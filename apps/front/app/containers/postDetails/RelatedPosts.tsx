import { Container } from '@mui/material';
import { useLoaderData } from '@remix-run/react';

import { isErrorJSON } from '@/front/lib/remix/safelyRun';

import type { SinglePostLoaderFunction } from '../../routes/posts.$slug';

import MorePostList from './components/MorePostList';

const RelatedPosts = () => {
	const data = useLoaderData<SinglePostLoaderFunction>();
	const { relatedPosts: posts } = data;

	if (isErrorJSON(posts)) {
		// const error = posts;

		return (
			<>
				<h2>An error ocurred.</h2>
				<button type="button">Retry</button>
			</>
		);
	}

	return <Container sx={{ pb: 15 }}>{!!posts.length && <MorePostList posts={posts} />}</Container>;
};

export default RelatedPosts;
