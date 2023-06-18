import React from 'react';

import ReactDOM from 'react-dom/client';

import App from './App';
import './main.css';

// --------------------------------------------------------------------------------------//
//                                   initialize parse                                   //
// --------------------------------------------------------------------------------------//
Parse.initialize('aktivpost');

const locationOrigin = window.location.origin;
const parseServerURL =
	locationOrigin.includes('localhost') || locationOrigin.includes('127.0.0.1')
		? 'http://localhost:6182/parse'
		: `${locationOrigin}/parse`;

Parse.serverURL = parseServerURL;

// --------------------------------------------------------------------------------------//
//                                 render the react app                                 //
// --------------------------------------------------------------------------------------//
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
