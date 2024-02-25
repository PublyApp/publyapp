import { useMemo } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Container } from '@mui/material';
import { m } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';

import { getUpdatePostInputSchema, type UpdatePostInput } from '@devist/shared/validations/post.validations';
import {
	useGetPostByIdSuspenseQuery,
	useUpdatePostMutation,
} from '@devist/ui-react/lib/react-query/features/posts/post.hooks';

import PageHeader from '@/office/components/PageHeader';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { pxToRem } from '@/ui-react/utils/css.utils';

import PostForm from './PostForm';

const EditPost = () => {
	// const { t } = useTranslation();
	const { lang, t } = useTranslate();
	const params = useParams();

	const savePostInputSchema = useMemo(() => {
		return getUpdatePostInputSchema(t);
	}, [t]);

	const {
		result: { data: post },
	} = useGetPostByIdSuspenseQuery({ params: { id: params.postId || '' } });

	const {
		result: { mutate: updatePost },
	} = useUpdatePostMutation();

	const updatePostForm = useForm<UpdatePostInput>({
		resolver: zodResolver(savePostInputSchema),
		// values: {
		// 	locale: lang.value,
		// 	slug: 'what-the-fuck',
		// 	title: 'your post title',
		// 	description: 'your post description',
		// 	content: '## your content here',
		// },
		// defaultValues: {
		// 	objectId: post.objectId,
		// 	locale: lang.value,
		// 	authorId: post.author.objectId,
		// 	title: post.translation[lang.value]?.title,
		// 	description: post.translation[lang.value]?.description,
		// 	content: post.translation[lang.value]?.content,
		// 	published: post.published,
		// 	slug: post.slug,
		// },
		values: {
			objectId: post.objectId,
			locale: lang.value,
			authorId: post.author.objectId,
			title: post.translation[lang.value]?.title || '',
			description: post.translation[lang.value]?.description || '',
			content: post.translation[lang.value]?.content || '',
			published: post.published || false,
			slug: post.slug,
		},
	});

	const handleUpdatePost = updatePostForm.handleSubmit(
		(input) => {
			console.log('--- handleUpdatePost input ---', input);
			updatePost(input);
		},
		(errors) => {
			console.log('--- handleUpdatePost errors ---', errors);
		},
	);

	const headingElement = <PageHeader.Heading text="Edit post" />;
	const breadcrumbsElement = (
		<PageHeader.Breadcrumbs
			links={[
				{
					name: 'Dashboard',
					href: BO_PATH_NAMES.dashboard.root,
				},
				{
					name: 'Posts',
					href: BO_PATH_NAMES.dashboard.posts.root,
				},
				{
					name: 'Edit',
					// href: BO_PATH_NAMES.dashboard.posts.edi,
				},
			]}
		/>
	);

	const renderHeaderActions = (
		<>
			<Button>preview</Button>
			<Button variant="contained" onClick={handleUpdatePost}>
				save
			</Button>
		</>
	);

	const OFFSET_SLIDE = 20;

	const variants = {
		alert: {
			show: {
				y: OFFSET_SLIDE,
				opacity: 1,
				display: 'block',
				// visibility: 'visible',
			},
			hide: {
				y: -OFFSET_SLIDE,
				opacity: 0,
				display: 'none',
				// visibility: 'hidden',
				// transition: { duration: 3 },
			},
		},
		form: {
			showAlert: { y: OFFSET_SLIDE /* transition: { duration: 3 } */ },
			hideAlert: { y: 0 /* transition: { duration: 3 } */ },
		},
	};

	return (
		<Container maxWidth={/* settings.themeStretch ? false :  */ 'lg'}>
			<PageHeader
				heading={headingElement}
				breadcrumbs={breadcrumbsElement}
				action={renderHeaderActions}
				// moreLink={['#']}
				sx={{
					mb: { xs: 3, md: 5 },
				}}
			/>

			{/* <m.div layout> */}
			<m.div
				//
				initial={{
					opacity: 0,
					y: -OFFSET_SLIDE,
					//
					display: 'none',
					// visibility: 'hidden',
				}}
				variants={variants.alert as never}
				animate={!post.translation[lang.value] ? 'show' : 'hide'}
			>
				<Alert severity="info" onClose={undefined} sx={{ width: 1, mb: pxToRem(24) }}>
					This post does not have a translation in the current language
				</Alert>
			</m.div>

			<m.div
				//
				initial={{ y: 0 }}
				variants={variants.form}
				animate={!post.translation[lang.value] ? 'showAlert' : 'hideAlert'}
			>
				<PostForm form={updatePostForm} edit />
			</m.div>
			{/* </m.div> */}
		</Container>
	);
};

export default EditPost;
