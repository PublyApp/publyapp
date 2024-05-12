import { Container } from '@mui/material';
import { useLoaderData, useRevalidator } from '@remix-run/react';

import Retry from '@/front/components/Retry';
import { isErrorJSON } from '@/front/lib/remix/safelyRun';
import useTranslate from '@/ui-react/hooks/useTranslate';

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

		// return (
		// 	<Container
		// 		maxWidth="lg"
		// 		sx={{
		// 			py: 12,
		// 			mb: 6,
		// 			borderBottom: (theme) => {
		// 				return `solid 1px ${theme.palette.divider}`;
		// 			},
		// 		}}
		// 	>
		// 		<Typography variant="h3" mb={3}>
		// 			{message}
		// 		</Typography>
		// 		{/* <p>{description}</p> */}
		// 		<LoadingButton
		// 			size="large"
		// 			variant="contained"
		// 			// <Icon icon="fa6-solid:arrow-rotate-right" />
		// 			// <Icon icon="gravity-ui:arrow-rotate-right" />
		// 			startIcon={<Iconify icon="gravity-ui:arrow-rotate-right" width={24} />}
		// 			// startIcon={<Iconify icon="svg-spinners:12-dots-scale-rotate" width={24} />}
		// 			loadingIndicator={<Iconify icon="svg-spinners:12-dots-scale-rotate" width={24} />}
		// 			loading={state === 'loading'}
		// 			loadingPosition="start"
		// 			onClick={() => {
		// 				revalidate();
		// 			}}
		// 		>
		// 			<span>{t('retry')}</span>
		// 		</LoadingButton>
		// 	</Container>
		// );
	}

	return <Container sx={{ pb: 15 }}>{!!posts.length && <MorePostList posts={posts} />}</Container>;
};

export default RelatedPosts;
