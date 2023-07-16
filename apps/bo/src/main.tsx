import React from 'react';

import ReactDOM from 'react-dom/client';

import App from './App';
import './main.css';

// --------------------------------------------------------------------------------------//
//                                   initialize parse                                   //
// --------------------------------------------------------------------------------------//
Parse.initialize('aktiveo');
Parse.serverURL = 'http://localhost:6180/parse';

// --------------------------------------------------------------------------------------//
//                                 render the react app                                 //
// --------------------------------------------------------------------------------------//
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
