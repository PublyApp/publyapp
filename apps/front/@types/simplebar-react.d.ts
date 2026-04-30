// /**
//  * simplebar-react - v3.3.1
//  * React component for SimpleBar
//  * https://grsmto.github.io/simplebar/
//  *
//  * Made by Adrien Denat
//  * Under MIT License
//  */

// declare module 'simplebar-react' {
// 	import type * as React from 'react';
// 	import type { ReactNode, MutableRefObject } from 'react';
// 	import type SimpleBarCore from 'simplebar-core';
// 	import type { SimpleBarOptions } from 'simplebar-core';

// 	type RenderFunc = (props: {
// 		scrollableNodeRef: MutableRefObject<HTMLElement | undefined>;
// 		scrollableNodeProps: {
// 			className: string;
// 			ref: MutableRefObject<HTMLElement | undefined>;
// 		};
// 		contentNodeRef: MutableRefObject<HTMLElement | undefined>;
// 		contentNodeProps: {
// 			className: string;
// 			ref: MutableRefObject<HTMLElement | undefined>;
// 		};
// 	}) => ReactNode;
// 	export interface Props
// 		extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'>,
// 			SimpleBarOptions {
// 		children?: ReactNode | RenderFunc;
// 		scrollableNodeProps?: {
// 			// oxlint-disable-next-line typescript/no-explicit-any -- <explanation>
// 			ref?: any;
// 			className?: string;
// 			// oxlint-disable-next-line typescript/no-explicit-any -- <explanation>
// 			[key: string]: any;
// 		};
// 	}
// 	declare const SimpleBar: React.ForwardRefExoticComponent<
// 		Props & React.RefAttributes<SimpleBarCore | null>
// 	>;
// 	export default SimpleBar;
// }
