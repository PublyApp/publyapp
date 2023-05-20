import React from 'react';

import { Button } from '@devist/ui-react';

import image from './assets/react.svg';

function App() {
	const [count, setCount] = React.useState(0);

	return (
		<>
			<img src={image} alt="cool" />
			<h1>This is the bo, count: {count}</h1>
			<Button
				onClick={() => {
					setCount(count + 1);
				}}
			/>
		</>
	);
}

export default App;
