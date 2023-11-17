import Parse from 'parse';
import React from 'react';

import ReactDOM from 'react-dom/client';

import { initReactLocalization } from '@devist/ui-react/lib/i18n';

import App from './App';
import { syncPopstateEvent } from './lib/zustand/store';

// import './main.css';

console.log('process.env.ACME', process.env.ACME);

// --- sync popstate event with zustand
syncPopstateEvent();

// ---- initialize parse -----------------------------------------------------------------
Parse.initialize('devist');
Parse.serverURL = 'http://localhost:6180/parse';

window.Parse = Parse;

// ---- i18next localization -------------------------------------------------------------
initReactLocalization();

// ---- render the react app -------------------------------------------------------------
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
