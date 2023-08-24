// import { hydrateRoot } from 'react-dom/client';

// import { PageShell } from './PageShell';
// import type { PageContextClient } from './types';

// // This render() hook only supports SSR, see https://vite-plugin-ssr.com/render-modes for how to modify render() to support SPA
// async function render(pageContext: PageContextClient) {
// 	const { Page, pageProps } = pageContext;
// 	if (!Page) throw new Error('Client-side render() hook expects pageContext.Page to be defined');
// 	const root = document.getElementById('react-root');
// 	if (!root) throw new Error('DOM element #react-root not found');
// 	hydrateRoot(
// 		root,
// 		<PageShell pageContext={pageContext}>
// 			<Page {...pageProps} />
// 		</PageShell>,
// 	);
// }

// export { render };

// /* To enable Client-side Routing:
// export const clientRouting = true
// // !! WARNING !! Before doing so, read https://vite-plugin-ssr.com/clientRouting */
// export const clientRouting = true;
// export const hydrationCanBeAborted = true;

// import React from 'react';

import ReactDOM from 'react-dom/client';

// import { getPageTitle } from './getPageTitle';
import { PageShell } from './PageShell';
import type { PageContextClient } from './types';

let root: ReactDOM.Root;

async function render(pageContext: PageContextClient) {
	const { Page, pageProps } = pageContext;
	const page = (
		<PageShell pageContext={pageContext}>
			<Page {...pageProps} />
		</PageShell>
	);
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const container = document.getElementById('react-root')!;

	if (pageContext.isHydration) {
		root = ReactDOM.hydrateRoot(container, page);
	} else {
		if (!root) {
			root = ReactDOM.createRoot(container);
		}

		root.render(page);
	}

	document.title = /* getPageTitle(pageContext); */ 'idk';
}

function onHydrationEnd() {
	console.log('Hydration finished; page is now interactive.');
}

function onPageTransitionStart() {
	console.log('Page transition start');
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	document.querySelector('body')!.classList.add('page-is-transitioning');
}

function onPageTransitionEnd() {
	console.log('Page transition end');
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	document.querySelector('body')!.classList.remove('page-is-transitioning');
}

export { render };
export { onHydrationEnd };
export { onPageTransitionStart };
export { onPageTransitionEnd };
export const clientRouting = true;
export const hydrationCanBeAborted = true;
