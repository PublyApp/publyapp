import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Container } from '@mui/material';
import { m } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';

import {
	getUpdateBlogPostInputSchemaClientSide,
	type UpdateBlogPostInputClientSide,
} from '@devist/shared/validations/blogPost/blogPost.validations.client';
import {
	useGetBlogPostByIdSuspenseQuery,
	useUpdateBlogPostMutation,
} from '@devist/ui-react/lib/react-query/features/blogPost/blogPost.hooks';

import PageHeader from '@/office/components/PageHeader';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import useTranslate from '@/ui-react/hooks/useTranslate';
import zod from '@/ui-react/lib/zod';
import { pxToRem } from '@/ui-react/utils/css.utils';

import PostForm from '../_common/PostForm';

const EditPost = () => {
	// const { t } = useTranslation();
	const { lang, t } = useTranslate();
	const params = useParams();

	const savePostInputSchema = getUpdateBlogPostInputSchemaClientSide(zod);

	const {
		result: { data: post },
	} = useGetBlogPostByIdSuspenseQuery({ params: { id: params.postId || '' } });

	const {
		result: { mutateAsync: updatePostAsync, isPending: isUpdatePostPending },
	} = useUpdateBlogPostMutation({
		onSuccess: () => {},
	});

	// const publishDate = useMemo(() => {
	// 	return post.publishDate ? new Date(post.publishDate) : undefined;
	// }, [post.publishDate]);

	// const updateDate = useMemo(() => {
	// 	return post.updateDate ? new Date(post.updateDate) : undefined;
	// }, [post.updateDate]);

	const updatePostForm = useForm<UpdateBlogPostInputClientSide>({
		resolver: zodResolver(savePostInputSchema),
		values: {
			objectId: post.objectId,
			authorId: post.author.objectId,
			published: post.published,
			// --
			locale: lang.value,
			title: post.translation[lang.value]?.title || '',
			description: post.translation[lang.value]?.description || '',
			content: post.translation[lang.value]?.content || '',
			slug: post.slug,
			publishDate: post.publishDate ? new Date(post.publishDate) : undefined,
			updateDate: post.updateDate ? new Date(post.updateDate) : undefined,
			coverUrl: undefined,
			coverId: undefined,
			coverFile: post.coverFile,
			tags: post.tags,
		},
		disabled: isUpdatePostPending,
	});

	// updatePostForm.setValue('coverUrl', { preView: post.cover?.url }, { shouldValidate: true });

	const handleUpdatePost = updatePostForm.handleSubmit(
		async (input) => {
			console.log('--- handleUpdatePost input ---', input);
			await updatePostAsync(input);
		},
		(errors) => {
			console.log('--- handleUpdatePost errors ---', errors);
		},
	);

	const headingElement = <PageHeader.Heading text={t('edit-post')} />;
	const breadcrumbsElement = (
		<PageHeader.Breadcrumbs
			links={[
				{
					name: 'Dashboard',
					href: BO_PATH_NAMES.dashboard.root,
				},
				{
					name: `${t('post')}s`,
					href: BO_PATH_NAMES.dashboard.posts.root,
				},
				{
					name: t('edit'),
					// href: BO_PATH_NAMES.dashboard.posts.edi,
				},
			]}
		/>
	);

	const renderHeaderActions = (
		<>
			<Button>{t('preview')}</Button>
			<Button variant="contained" onClick={handleUpdatePost}>
				{t('save')}
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
					{/* This post does not have a translation in the current language */}
					{t('item-not-translated', { item: t('post') })}
				</Alert>
			</m.div>

			<m.div
				//
				initial={{ y: 0 }}
				variants={variants.form}
				animate={!post.translation[lang.value] ? 'showAlert' : 'hideAlert'}
			>
				<PostForm form={updatePostForm} edit localeContent={post.translation[lang.value]?.content || ''} />
			</m.div>
			{/* </m.div> */}
		</Container>
	);
};

export default EditPost;
