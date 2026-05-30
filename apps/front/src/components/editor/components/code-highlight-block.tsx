import Box from '@mui/material/Box';
import {
	NodeViewContent,
	type NodeViewProps,
	NodeViewWrapper,
} from '@tiptap/react';

import './code-highlight-block.css';
import { editorClasses } from '../classes';

// ----------------------------------------------------------------------

export const CodeHighlightBlock = ({
	node: {
		attrs: { language: defaultLanguage },
	},
	extension,
	updateAttributes,
}: NodeViewProps) => {
	return (
		<NodeViewWrapper className={editorClasses.content.codeBlock}>
			<Box
				component="select"
				name="language"
				contentEditable={false}
				defaultValue={defaultLanguage}
				onChange={(event) => {
					return updateAttributes({
						language: (event.target as HTMLSelectElement).value,
					});
				}}
				className={editorClasses.content.langSelect}
			>
				<option value="null">auto</option>
				<option disabled>—</option>
				{extension.options.lowlight.listLanguages().map((lang: string) => {
					return (
						<option key={lang} value={lang}>
							{lang}
						</option>
					);
				})}
			</Box>

			<pre>
				<NodeViewContent as="code" />
			</pre>
		</NodeViewWrapper>
	);
};
