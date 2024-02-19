import React from 'react';

import ReactDOM from 'react-dom/client';

import { initI18next } from '@devist/ui-react/lib/i18n';
import { initNumeral } from '@devist/ui-react/lib/numeral';

import App from './App';
import { env } from './lib/env';
import { initParse } from './lib/parse';

import './main.css';
import 'react-lazy-load-image-component/src/effects/blur.css';

// --- redirect to the app's basename
if (window.location.pathname === '/') {
	window.location.pathname = env.OFFICE_ROUTER_BASENAME;
}

// ---- i18next localization -------------------------------------------------------------
initI18next();

// ---- numeral.js init ------------------------------------------------------------------
initNumeral();

// ---- initialize parse -----------------------------------------------------------------
initParse();

// ---- render the react app -------------------------------------------------------------
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
