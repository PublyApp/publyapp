import Parse from 'parse';
import React from 'react';

import ReactDOM from 'react-dom/client';

import { initReactLocalization } from '@devist/ui-react/lib/i18n';

import App from './App';
import { syncPopState } from './lib/zustand/store';

// import './main.css';

// --- sync popstate event with zustand
// syncPopState();

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
