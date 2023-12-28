import CodeFlask from '@calumk/editorjs-codeflask';
import Checklist from '@editorjs/checklist';
import Delimiter from '@editorjs/delimiter';
import type { EditorConfig } from '@editorjs/editorjs';
import Embed from '@editorjs/embed';
import Header from '@editorjs/header';
import Image from '@editorjs/image';
import InlineCode from '@editorjs/inline-code';
import Link from '@editorjs/link';
import NestedList from '@editorjs/nested-list';
import Paragraph from '@editorjs/paragraph';
import Quote from '@editorjs/quote';
import RawHtml from '@editorjs/raw';
import Table from '@editorjs/table';
import Underline from '@editorjs/underline';
import Warning from '@editorjs/warning';

// import Code from '@editorjs/code';
// import List from '@editorjs/list';

const tools: EditorConfig['tools'] = {
	header: Header,
	embed: Embed,
	checklist: {
		class: Checklist,
		inlineToolbar: true,
	},
	// code: Code,
	code: CodeFlask,
	table: Table,
	image: {
		class: Image,
		config: {
			endpoints: {
				byFile: 'http://localhost:8008/uploadFile', // Your backend file uploader endpoint
				byUrl: 'http://localhost:8008/fetchUrl', // Your endpoint that provides uploading by Url
			},
		},
	},
	warning: Warning,
	paragraph: {
		class: Paragraph,
		inlineToolbar: true,
	},
	linkTool: {
		class: Link,
		config: {
			endpoint: 'http://localhost:8008/fetchUrl', // Your backend endpoint for url data fetching,
		},
	},
	quote: Quote,
	inlineCode: {
		class: InlineCode,
		shortcut: 'CMD+SHIFT+M',
	},
	delimiter: Delimiter,
	// list: {
	// 	class: List,
	// 	inlineToolbar: true,
	// 	config: {
	// 		defaultStyle: 'unordered',
	// 	},
	// },
	list: {
		class: NestedList,
		inlineToolbar: true,
		config: {
			defaultStyle: 'unordered',
		},
	},
	raw: RawHtml,
	underline: Underline,
};

export default tools;
