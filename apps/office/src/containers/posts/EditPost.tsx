// import Editor from '@devist/ui-react/components/Editor';
import { useMemo } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
// import { type MDXEditorMethods } from '@mdxeditor/editor';
import { Button, Container, Stack, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { getCreatePostInputSchema, type CreatePostInput } from '@devist/shared/validations/post.validations';
import FormProvider from '@devist/ui-react/components/form/FormProvider';
import RHFMdxEditor from '@devist/ui-react/components/form/RHFMdxEditor';
import RHFTextField from '@devist/ui-react/components/form/RHFTextField';

import PageHeader from '@/office/components/PageHeader';
// import { postContentTypes } from '@/shared/types/db/post.types';
import useLocale from '@/ui-react/hooks/useLocale';

const EditPost = () => {
	// return <Editor />;
	// const editorRef = useRef<MDXEditorMethods>(null);
	const { t } = useTranslation();
	const { lang } = useLocale();

	const savePostInputSchema = useMemo(() => {
		return getCreatePostInputSchema(t);
	}, [t]);

	const createPostForm = useForm<CreatePostInput>({
		resolver: zodResolver(savePostInputSchema),
		values: {
			locale: lang.value,
			slug: 'what-the-fuck',
			title: 'your post title',
			description: 'your post description',
			content: '## your content here',
		},
		// defaultValues: async () => {
		// 	return {
		// 		locale: lang.value,
		// 		title: 'your post title',
		// 		description: 'your post description',
		// 		content: '## your content here',
		// 		// content: {
		// 		// 	type: postContentTypes[0],
		// 		// 	value: '## your content here',
		// 		// },
		// 	};
		// },
	});

	const headingElement = <PageHeader.Heading text="New post" />;
	const breadcrumbsElement = <PageHeader.Breadcrumbs links={[{ name: 'ok' }]} />;

	const handleSavePost = createPostForm.handleSubmit(
		async (value) => {
			console.log('😁😁😁', value);
		},
		(v) => {
			console.log('😡😡😡', v);
		},
	);

	const renderHeaderActions = (
		<>
			<Button>preview</Button>
			<Button variant="contained" onClick={handleSavePost}>
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
			<FormProvider form={createPostForm} /* onSubmit={handleSavePost} */>
				<Stack spacing={3}>
					<RHFTextField name="title" label="Post Title" />
					<RHFTextField name="description" label="Description" multiline rows={3} />
					<RHFTextField name="slug" label="Slug" />

					<Stack spacing={1.5}>
						<Typography variant="subtitle2">Content</Typography>
						<RHFMdxEditor name="content" />
					</Stack>
				</Stack>
			</FormProvider>
		</Container>
	);
};

export default EditPost;
