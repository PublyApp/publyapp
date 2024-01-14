import { Stack, Typography } from '@mui/material';
import { type UseFormReturn } from 'react-hook-form';

import FormProvider from '@devist/ui-react/components/form/FormProvider';
import RHFMdxEditor from '@devist/ui-react/components/form/RHFMdxEditor';
import RHFTextField from '@devist/ui-react/components/form/RHFTextField';

type Props = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: UseFormReturn<any>;
};

const PostForm = ({ form }: Props) => {
	return (
		<FormProvider
			form={form}
			// onSubmit={handleSavePost}
		>
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
	);
};

export default PostForm;
