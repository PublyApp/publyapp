import React from 'react';

import ReactDOM from 'react-dom/client';

import { initReactLocalization } from '@devist/ui-react/lib/i18n';

import App from './App';
import { initParse } from './lib/parse';

import './main.css';
import 'react-lazy-load-image-component/src/effects/blur.css';

// --- sync necessary events with zustand
// syncEventsForZustand();

// ---- initialize parse -----------------------------------------------------------------
initParse();

// ---- i18next localization -------------------------------------------------------------
initReactLocalization();

// ---- render the react app -------------------------------------------------------------
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
