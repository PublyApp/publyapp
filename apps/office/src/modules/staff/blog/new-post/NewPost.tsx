import { zodResolver } from '@hookform/resolvers/zod';
import { LoadingButton } from '@mui/lab';
import { Container } from '@mui/material';
import { useForm } from 'react-hook-form';

import {
	getCreateBlogPostInputSchemaClientSide,
	type CreateBlogPostInputClientSide,
} from '@devist/shared/validations/blogPost/blogPost.validations.client';

import PageHeader from '@/office/components/PageHeader';
import { BO_PATH_NAMES } from '@/shared/lib/constants';
import Iconify from '@/ui-react/components/Iconify';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { useCreateBlogPostMutation } from '@/ui-react/lib/react-query/features/blogPost/blogPost.hooks';
import zod from '@/ui-react/lib/zod';

import PostForm from '../_common/PostForm';

const NewPost = () => {
	const { lang, t } = useTranslate();

	const savePostInputSchema = getCreateBlogPostInputSchemaClientSide(zod);

	const createPostForm = useForm<CreateBlogPostInputClientSide>({
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
		result: { mutateAsync: createPostAsync, isPending: isPendingCreatePost },
	} = useCreateBlogPostMutation();

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
			{/* <Button variant="contained" onClick={handleCreatePost}>
				{t('save')}
			</Button> */}
			<LoadingButton
				variant="contained"
				size="large"
				onClick={handleCreatePost}
				loading={isPendingCreatePost}
				// startIcon={<Iconify icon="material-symbols:save-outline" width={24} />}
				loadingIndicator={<Iconify icon="svg-spinners:12-dots-scale-rotate" width={24} />}
				color="inherit"
			>
				{t('save')}
			</LoadingButton>
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
