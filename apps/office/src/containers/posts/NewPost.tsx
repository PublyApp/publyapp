import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Container } from '@mui/material';
import { useForm } from 'react-hook-form';

import {
	getCreatePostInputSchemaClientSide,
	type CreatePostSchemaClientSide,
} from '@devist/shared/validations/post/post.validations.client';

import PageHeader from '@/office/components/PageHeader';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { useCreatePostMutation } from '@/ui-react/lib/react-query/features/posts/post.hooks';
import zod from '@/ui-react/lib/zod';

import PostForm from './PostForm';

const NewPost = () => {
	const { lang, t } = useTranslate();

	const savePostInputSchema = getCreatePostInputSchemaClientSide(zod);

	const createPostForm = useForm<CreatePostSchemaClientSide>({
		resolver: zodResolver(savePostInputSchema),
		values: {
			locale: lang.value,
			// title: 'your post title',
			// description: 'your post description',
			// content: '## your content here',
			// slug: 'your-post-slug',
			title: '',
			description: '',
			content: '',
			slug: '',
			tags: undefined,
			publishDate: undefined,
			updateDate: undefined,
			coverUrl: undefined,
			coverFile: undefined,
		},
	});

	const {
		result: { mutateAsync: createPostAsync },
	} = useCreatePostMutation();

	const handleCreatePost = createPostForm.handleSubmit(
		async (input) => {
			console.log('--- handleCreatePost input ---', input);
			await createPostAsync(input);
		},
		(errors) => {
			console.log('--- handleCreatePost errors ---', errors);
		},
	);

	const headingElement = <PageHeader.Heading text={t('new-post')} />;
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
					name: t('new'),
					// href: BO_PATH_NAMES.dashboard.posts.edi,
				},
			]}
		/>
	);

	const renderHeaderActions = (
		<>
			{/* <Button>preview</Button> */}
			<Button variant="contained" onClick={handleCreatePost}>
				{t('save')}
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
