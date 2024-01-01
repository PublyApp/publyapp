import Parse from 'parse';
import React from 'react';

import ReactDOM from 'react-dom/client';

import { initReactLocalization } from '@devist/ui-react/lib/i18n';

import App from './App';
import { env } from './lib/env';

import './main.css';
import 'react-lazy-load-image-component/src/effects/blur.css';

// --- sync necessary events with zustand
// syncEventsForZustand();

// ---- initialize parse -----------------------------------------------------------------
Parse.initialize(env.PARSE_APP_ID);
Parse.serverURL = env.PARSE_SERVER_URL;

window.Parse = Parse;

// ---- i18next localization -------------------------------------------------------------
initReactLocalization();

// ---- render the react app -------------------------------------------------------------
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
