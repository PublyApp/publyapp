// import Editor from '@devist/ui-react/components/Editor';
import { Button, Container } from '@mui/material';

import MdxEditor from '@devist/ui-react/components/MdxEditor';

import PageHeader from '@/office/components/PageHeader';

const NewPost = () => {
	// return <Editor />;
	const headingElement = <PageHeader.Heading text="New post" />;
	const breadcrumbsElement = <PageHeader.Breadcrumbs links={[{ name: 'ok' }]} />;
	const renderActions = (
		<>
			<Button>preview</Button>
			<Button variant="contained">save</Button>
		</>
	);

	return (
		<Container maxWidth={/* settings.themeStretch ? false :  */ 'lg'}>
			<PageHeader
				heading={headingElement}
				breadcrumbs={breadcrumbsElement}
				action={renderActions}
				// moreLink={['#']}
			/>
			<MdxEditor />;
		</Container>
	);
};

export default NewPost;
