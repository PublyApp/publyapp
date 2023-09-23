import { Button } from '@mui/material';
import { Color } from '@tiptap/extension-color';
import ListItem from '@tiptap/extension-list-item';
import TextStyle from '@tiptap/extension-text-style';
import { BubbleMenu, EditorProvider, FloatingMenu, useCurrentEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

// define your extension array
// const extensions = [StarterKit];

// const content = '<p>Hello World!</p>';

const extensions = [
	Color.configure({ types: [TextStyle.name, ListItem.name] }),
	TextStyle.configure({
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		types: [ListItem.name],
	}),
	StarterKit.configure({
		bulletList: {
			keepMarks: true,
			keepAttributes: false, // TODO : Making this as `false` becase marks are not preserved when I try to preserve attrs, awaiting a bit of help
		},
		orderedList: {
			keepMarks: true,
			keepAttributes: false, // TODO : Making this as `false` becase marks are not preserved when I try to preserve attrs, awaiting a bit of help
		},
	}),
];

const content = `
<h2>
  Hi there,
</h2>
<p>
  this is a <em>basic</em> example of <strong>tiptap</strong>. Sure, there are all kind of basic text styles you’d probably expect from a text editor. But wait until you see the lists:
</p>
<ul>
  <li>
    That’s a bullet list with one …
  </li>
  <li>
    … or two list items.
  </li>
</ul>
<p>
  Isn’t that great? And all of that is editable. But wait, there’s more. Let’s try a code block:
</p>
<pre><code class="language-css">body {
display: none;
}</code></pre>
<p>
  I know, I know, this is impressive. It’s only the tip of the iceberg though. Give it a try and click a little bit around. Don’t forget to check the other examples too.
</p>
<blockquote>
  Wow, that’s amazing. Good work, boy! 👏
  <br />
  — Mom
</blockquote>
`;

const Tiptap = () => {
	return (
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		<EditorProvider slotBefore={<MenuBar />} extensions={extensions} content={content}>
			<FloatingMenu>This is the floating menu</FloatingMenu>
			<BubbleMenu>This is the bubble menu</BubbleMenu>
		</EditorProvider>
	);
};

export default Tiptap;

// import './styles.scss'

const MenuBar = () => {
	const { editor } = useCurrentEditor();

	if (!editor) {
		return null;
	}

	// editor.getHTML();

	return (
		<>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleBold().run();
				}}
				disabled={!editor.can().chain().focus().toggleBold().run()}
				className={editor.isActive('bold') ? 'is-active' : ''}
			>
				bold
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleItalic().run();
				}}
				disabled={!editor.can().chain().focus().toggleItalic().run()}
				className={editor.isActive('italic') ? 'is-active' : ''}
			>
				italic
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleStrike().run();
				}}
				disabled={!editor.can().chain().focus().toggleStrike().run()}
				className={editor.isActive('strike') ? 'is-active' : ''}
			>
				strike
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleCode().run();
				}}
				disabled={!editor.can().chain().focus().toggleCode().run()}
				className={editor.isActive('code') ? 'is-active' : ''}
			>
				code
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().unsetAllMarks().run();
				}}
			>
				clear marks
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().clearNodes().run();
				}}
			>
				clear nodes
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().setParagraph().run();
				}}
				className={editor.isActive('paragraph') ? 'is-active' : ''}
			>
				paragraph
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleHeading({ level: 1 }).run();
				}}
				className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
			>
				h1
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleHeading({ level: 2 }).run();
				}}
				className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
			>
				h2
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleHeading({ level: 3 }).run();
				}}
				className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
			>
				h3
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleHeading({ level: 4 }).run();
				}}
				className={editor.isActive('heading', { level: 4 }) ? 'is-active' : ''}
			>
				h4
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleHeading({ level: 5 }).run();
				}}
				className={editor.isActive('heading', { level: 5 }) ? 'is-active' : ''}
			>
				h5
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleHeading({ level: 6 }).run();
				}}
				className={editor.isActive('heading', { level: 6 }) ? 'is-active' : ''}
			>
				h6
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleBulletList().run();
				}}
				className={editor.isActive('bulletList') ? 'is-active' : ''}
			>
				bullet list
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleOrderedList().run();
				}}
				className={editor.isActive('orderedList') ? 'is-active' : ''}
			>
				ordered list
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleCodeBlock().run();
				}}
				className={editor.isActive('codeBlock') ? 'is-active' : ''}
			>
				code block
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().toggleBlockquote().run();
				}}
				className={editor.isActive('blockquote') ? 'is-active' : ''}
			>
				blockquote
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().setHorizontalRule().run();
				}}
			>
				horizontal rule
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().setHardBreak().run();
				}}
			>
				hard break
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().undo().run();
				}}
				disabled={!editor.can().chain().focus().undo().run()}
			>
				undo
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().redo().run();
				}}
				disabled={!editor.can().chain().focus().redo().run()}
			>
				redo
			</Button>
			<Button
				onClick={() => {
					return editor.chain().focus().setColor('#958DF1').run();
				}}
				className={editor.isActive('textStyle', { color: '#958DF1' }) ? 'is-active' : ''}
			>
				purple
			</Button>
		</>
	);
};

// export default () => {
//   return (
//     <EditorProvider slotBefore={<MenuBar />} extensions={extensions} content={content}></EditorProvider>
//   )
// }
