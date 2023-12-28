import { useEffect, useRef, useState } from 'react';

import EditorJS, { type LogLevels, type OutputData } from '@editorjs/editorjs';
import { css, cx } from '@emotion/css';
import _ from 'lodash';

import tools from '../lib/editorjs/tools';

// import '../assets/styles/xonokai-prism.css';

const DEFAULT_INITIAL_DATA: OutputData = {
	time: new Date().getTime(),
	blocks: [
		{
			type: 'header',
			data: {
				text: 'This is my awesome editor!',
				level: 1,
			},
		},
	],
};

const EDITOR_HOLDER_ID = 'editorjs';

const styles = {
	patchCodeEditor: css({
		'.codeflask.codeflask--has-line-numbers:before, .codeflask__lines': {
			zIndex: '0!important',
		},
		'.editorjs-codeFlask_Wrapper': {
			/* ... */
			zIndex: 0,
			position: 'inherit',
		},
		'& > div > div.ce-toolbar.ce-toolbar--opened > div > div > div.ce-settings > div > div.ce-popover.ce-popover--opened':
			{
				// overflow: 'auto!important',
				overflow: 'unset',
			},
	}),
};

const Editor = (/* _props: any */) => {
	const ejInstance = useRef<EditorJS | null>();
	const [editorData, setEditorData] = useState(() => {
		return DEFAULT_INITIAL_DATA;
	});

	const initEditor = () => {
		const editor = new EditorJS({
			holder: EDITOR_HOLDER_ID,
			logLevel: 'ERROR' as LogLevels,
			data: editorData,
			// onReady: () => {
			// 	ejInstance.current = editor;
			// },
			onChange: async (api, _event) => {
				const content = await api.saver.save();
				setEditorData(content);
			},
			autofocus: true,
			tools,
		});

		return editor;
	};

	// This will run only once
	useEffect(() => {
		if (_.isNil(ejInstance.current)) {
			const editor = initEditor();

			ejInstance.current = editor;
		}

		return () => {
			if (ejInstance.current?.destroy) {
				ejInstance.current?.destroy();
				ejInstance.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return <div className={cx(styles.patchCodeEditor)} id={EDITOR_HOLDER_ID} />;
};

export default Editor;
