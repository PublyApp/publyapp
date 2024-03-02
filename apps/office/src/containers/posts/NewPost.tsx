import { useMemo } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Container } from '@mui/material';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { getCreatePostInputSchema, type CreatePostInput } from '@devist/shared/validations/post.validations';

import PageHeader from '@/office/components/PageHeader';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { useCreatePostMutation } from '@/ui-react/lib/react-query/features/posts/post.hooks';

import PostForm from './PostForm';

const NewPost = () => {
	const { t } = useTranslation();
	const { lang } = useTranslate();

	const savePostInputSchema = useMemo(() => {
		return getCreatePostInputSchema(t);
	}, [t]);

	const createPostForm = useForm<CreatePostInput>({
		resolver: zodResolver(savePostInputSchema),
		values: {
			locale: lang.value,
			title: 'your post title',
			description: 'your post description',
			content: '## your content here',
			slug: 'your-post-slug',
			tags: undefined,
			publishDate: undefined,
			updateDate: undefined,
			coverUrl: undefined,
		},
	});

	const {
		result: { mutate: createPost },
	} = useCreatePostMutation();

	const handleCreatePost = createPostForm.handleSubmit(
		async (input) => {
			console.log('--- handleCreatePost input ---', input);
			createPost(input);
		},
		(errors) => {
			console.log('--- handleCreatePost errors ---', errors);
		},
	);

	const headingElement = <PageHeader.Heading text="New post" />;
	const breadcrumbsElement = <PageHeader.Breadcrumbs links={[{ name: 'ok' }]} />;

	const renderHeaderActions = (
		<>
			{/* <Button>preview</Button> */}
			<Button variant="contained" onClick={handleCreatePost}>
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
			<PostForm form={createPostForm} />
		</Container>
	);
};

export default NewPost;
