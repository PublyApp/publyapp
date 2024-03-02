import '@mdxeditor/editor/style.css';

import { type ReactNode } from 'react';

import { MDXEditor, type MDXEditorProps } from '@mdxeditor/editor';
import { alpha, Box, type SxProps, type Theme } from '@mui/material';
import _ from 'lodash';

import { ALL_PLUGINS } from '../lib/mdxEditor/boilerplate';

export type MdxEditorProps = MDXEditorProps & {
	id: string;
	helperText?: ReactNode;
	disabled?: boolean;
	error?: boolean;
	sx?: SxProps<Theme>;
};

const MdxEditor = ({
	id,
	helperText,
	error,
	disabled = false,
	sx /* = {} */,
	markdown = '# Hello world',
	plugins = ALL_PLUGINS,
	...other
}: MdxEditorProps) => {
	return (
		<Box
			id={`#${id}`}
			sx={[
				(theme) => {
					const radius = theme.spacing(1);

					return {
						border: `solid 1px ${alpha(theme.palette.grey[500], 0.2)}`,
						borderRadius: radius,
						'& [role="textbox"]': {
							backgroundColor: alpha(theme.palette.grey[500], 0.08),
						},
						'& [role="toolbar"]': {
							borderRadius: `${radius} ${radius} 0 0`,
							...(disabled && {
								backgroundColor: alpha(theme.palette.grey[500], 0.24),
								color: theme.palette.text.disabled,
							}),
						},
						...(error && {
							border: `solid 1px ${theme.palette.error.main}`,
							'& [role="textbox"]': {
								bgcolor: alpha(theme.palette.error.main, 0.08),
							},
						}),
						...(disabled && {
							pointerEvents: 'none',
							'& [role="textbox"]': {
								bgcolor: alpha(theme.palette.grey[500], 0.24),
								color: theme.palette.text.disabled,
							},
						}),
					};
				},
				...(_.isArray(sx) ? sx : [sx]),
			]}
		>
			<MDXEditor markdown={markdown} plugins={plugins} {...other} />
			{helperText && helperText}
		</Box>
	);
};

export default MdxEditor;
