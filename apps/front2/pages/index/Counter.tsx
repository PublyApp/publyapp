import { useState } from 'react';

const Counter = () => {
	const [count, setCount] = useState(0);

	return (
		<button
			type="button"
			onClick={() => {
				return setCount((iCount) => {
					return iCount + 1;
				});
			}}
		>
			Counter {count}
		</button>
	);
};

export { Counter };
