import { useMemo } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Container } from '@mui/material';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { getUpdatePostInputSchema, type UpdatePostInput } from '@devist/shared/validations/post.validations';
import { useGetPostByIdSuspenseQuery } from '@devist/ui-react/lib/react-query/features/posts/post.hooks';

import PageHeader from '@/office/components/PageHeader';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import useLocale from '@/ui-react/hooks/useLocale';

import PostForm from './PostForm';

const EditPost = () => {
	const { t } = useTranslation();
	const { lang } = useLocale();
	const params = useParams();

	const savePostInputSchema = useMemo(() => {
		return getUpdatePostInputSchema(t);
	}, [t]);

	const {
		result: { data: post },
	} = useGetPostByIdSuspenseQuery({ params: { id: params.postId || '' } });

	const updatePostForm = useForm<UpdatePostInput>({
		resolver: zodResolver(savePostInputSchema),
		// values: {
		// 	locale: lang.value,
		// 	slug: 'what-the-fuck',
		// 	title: 'your post title',
		// 	description: 'your post description',
		// 	content: '## your content here',
		// },
		defaultValues: {
			objectId: post.objectId,
			locale: lang.value,
			authorId: post.author.objectId,
			title: post.translation[lang.value].title,
			description: post.translation[lang.value].description,
			content: post.translation[lang.value].content,
			published: post.published,
			slug: post.slug,
		},
	});

	const handleUpdatePost = updatePostForm.handleSubmit(
		(input) => {
			console.log('--- handleUpdatePost input ---', input);
			// const newPost = Post.save()
			// queryClient.setQueryData({ key: ['getPostById'], data: newPost });
			// navigate(/posts/edit/newPost.id)
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
			<PostForm form={updatePostForm} />
		</Container>
	);
};

export default EditPost;
