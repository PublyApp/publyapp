import Parse from 'parse';
import React from 'react';

import ReactDOM from 'react-dom/client';

import App from './App';

import './main.css';

console.log('====================================');
// eslint-disable-next-line turbo/no-undeclared-env-vars
console.log(process.env.ACME);
console.log('====================================');

// --------------------------------------------------------------------------------------//
//                                   initialize parse                                   //
// --------------------------------------------------------------------------------------//
Parse.initialize('devist');
Parse.serverURL = 'http://localhost:6180/parse';

// --------------------------------------------------------------------------------------//
//                                 render the react app                                 //
// --------------------------------------------------------------------------------------//
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
