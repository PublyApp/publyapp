import '@mdxeditor/editor/style.css';

import { MDXEditor } from '@mdxeditor/editor';

import { ALL_PLUGINS } from '../lib/mdxEditor/boilerplate';

// import { BoldItalicUnderlineToggles, headingsPlugin, MDXEditor, toolbarPlugin, UndoRedo, KitchenSinkToolbar } from '@mdxeditor/editor';

const MdxEditor = () => {
	return <MDXEditor markdown="# Hello world" plugins={ALL_PLUGINS} />;
	// return (
	// 	<MDXEditor
	// 		markdown="# Hello world"
	// 		plugins={[
	// 			toolbarPlugin({
	// 				// eslint-disable-next-line react/no-unstable-nested-components
	// 				toolbarContents: () => {
	// 					return (
	// 						<>
	// 							{' '}
	// 							<UndoRedo />
	// 							<BoldItalicUnderlineToggles />
	// 						</>
	// 					);
	// 				},
	// 			}),
	// 		]}
	// 	/>
	// );
};

export default MdxEditor;
