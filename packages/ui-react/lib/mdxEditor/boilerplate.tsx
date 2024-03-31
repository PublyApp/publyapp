// import React from 'react'

// import { LeafDirective } from 'mdast-util-directive'

import {
	AdmonitionDirectiveDescriptor,
	codeBlockPlugin,
	codeMirrorPlugin,
	diffSourcePlugin,
	// DirectiveDescriptor,
	directivesPlugin,
	frontmatterPlugin,
	headingsPlugin,
	imagePlugin,
	KitchenSinkToolbar,
	linkDialogPlugin,
	linkPlugin,
	listsPlugin,
	markdownShortcutPlugin,
	quotePlugin,
	// tablePlugin,
	// thematicBreakPlugin,
	// toolbarPlugin,
	// sandpackPlugin,
	tablePlugin,
	thematicBreakPlugin,
	toolbarPlugin,
	// type SandpackConfig,
} from '@mdxeditor/editor';

// import dataCode from './assets/dataCode.ts?raw';

// const defaultSnippetContent = `
// export default function App() {
//   return (
//     <div className="App">
//       <h1>Hello CodeSandbox</h1>
//       <h2>Start editing to see some magic happen!</h2>
//     </div>
//   );
// }
// `.trim();

// export const virtuosoSampleSandpackConfig: SandpackConfig = {
// 	defaultPreset: 'react',
// 	presets: [
// 		{
// 			label: 'React',
// 			name: 'react',
// 			meta: 'live react',
// 			sandpackTemplate: 'react',
// 			sandpackTheme: 'light',
// 			snippetFileName: '/App.js',
// 			snippetLanguage: 'jsx',
// 			initialSnippetContent: defaultSnippetContent,
// 		},
// 		{
// 			label: 'React',
// 			name: 'react',
// 			meta: 'live',
// 			sandpackTemplate: 'react',
// 			sandpackTheme: 'light',
// 			snippetFileName: '/App.js',
// 			snippetLanguage: 'jsx',
// 			initialSnippetContent: defaultSnippetContent,
// 		},
// 		{
// 			label: 'Virtuoso',
// 			name: 'virtuoso',
// 			meta: 'live virtuoso',
// 			sandpackTemplate: 'react-ts',
// 			sandpackTheme: 'light',
// 			snippetFileName: '/App.tsx',
// 			initialSnippetContent: defaultSnippetContent,
// 			dependencies: {
// 				'react-virtuoso': 'latest',
// 				'@ngneat/falso': 'latest',
// 			},
// 			files: {
// 				'/data.ts': dataCode,
// 			},
// 		},
// 	],
// };

export const expressImageUploadHandler = async (image: File) => {
	const formData = new FormData();
	formData.append('image', image);
	const response = await fetch('/uploads/new', { method: 'POST', body: formData });
	const json = (await response.json()) as { url: string };
	return json.url;
};

// interface YoutubeDirectiveNode extends LeafDirective {
// 	name: 'youtube';
// 	attributes: { id: string };
// }

// export const YoutubeDirectiveDescriptor: DirectiveDescriptor<YoutubeDirectiveNode> = {
//   name: 'youtube',
//   type: 'leafDirective',
//   testNode(node) {
//     return node.name === 'youtube'
//   },
//   attributes: ['id'],
//   hasChildren: false,
//   Editor: ({ mdastNode, lexicalNode, parentEditor }) => {
//     return (
//       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
//         <button
//           onClick={() => {
//             parentEditor.update(() => {
//               lexicalNode.selectNext()
//               lexicalNode.remove()
//             })
//           }}
//         >
//           delete
//         </button>
//         <iframe
//           width="560"
//           height="315"
//           src={`https://www.youtube.com/embed/${mdastNode.attributes?.id}`}
//           title="YouTube video player"
//           frameBorder="0"
//           allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
//         ></iframe>
//       </div>
//     )
//   }
// }

// https://github.com/mdx-editor/editor/issues/370#issuecomment-1975081955
const codeblockLanguages = [
	// '',
	'javascript',
	'typescript',
	'html',
	'css',
	'xml',
	'json',
	'markdown',
	'sql',
	'bash',
	'shell',
	'text',
	'txt',
];

export const ALL_PLUGINS = [
	toolbarPlugin({
		toolbarContents: () => {
			return <KitchenSinkToolbar />;
		},
	}),
	listsPlugin(),
	quotePlugin(),
	headingsPlugin({ allowedHeadingLevels: [1, 2, 3] }),
	linkPlugin(),
	linkDialogPlugin(),
	imagePlugin({ imageAutocompleteSuggestions: ['https://via.placeholder.com/150', 'https://via.placeholder.com/150'] }),
	tablePlugin(),
	thematicBreakPlugin(),
	frontmatterPlugin(),
	codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' }),
	// sandpackPlugin({ sandpackConfig: virtuosoSampleSandpackConfig }),
	codeMirrorPlugin({
		codeBlockLanguages: codeblockLanguages.reduce((acc: any, value) => {
			acc[value] = value;
			return acc;
		}, {}),
	}),
	directivesPlugin({ directiveDescriptors: [/* YoutubeDirectiveDescriptor, */ AdmonitionDirectiveDescriptor] }),
	diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: 'boo' }),
	markdownShortcutPlugin(),
];
