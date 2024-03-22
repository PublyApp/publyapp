import React from 'react';

import ReactDOM from 'react-dom/client';

import { initI18next } from '@devist/ui-react/lib/i18n';
import { initNumeral } from '@devist/ui-react/lib/numeral';
import { initZod } from '@devist/ui-react/lib/zod';

import App from './App';
import { env } from './lib/env';
import { initParse } from './lib/parse/client';
// import { initParse } from './lib/parse/legacy';

import './main.css';
import 'react-lazy-load-image-component/src/effects/blur.css';

// --- redirect to the app's basename
if (!window.location.pathname.startsWith(env.OFFICE_ROUTER_BASENAME)) {
	const newPathName = env.OFFICE_ROUTER_BASENAME + window.location.pathname;
	window.location.pathname = newPathName;
}

initI18next();
initNumeral();
initParse();
initZod();

// ---- render the react app -------------------------------------------------------------
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
