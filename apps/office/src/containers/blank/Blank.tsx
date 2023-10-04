// import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

// import qs from 'qs';
// import { type URLSearchParamsInit } from 'react-dom';
// import { useSearchParams, type URLSearchParamsInit } from 'react-router-dom';
// import { useImmer } from 'use-immer';

const Blank = () => {
	// const [searchParams, setSearchParams] = useSearchParams();

	// const [myObj, setObject] = useState({ ok: true, lol: [{ a: true }] });

	// useEffect(() => {
	// 	console.log('====================================');
	// 	console.log(searchParams);
	// 	console.log('====================================');
	// }, [searchParams]);

	return (
		<Box>
			<Typography variant="h1">Blank</Typography>

			<Button
				onClick={() => {
					// setObject((prev) => {
					// 	return { ok: !prev.ok };
					// });
					// setSearchParams(qs.stringify(myObj));
					// searchParams.set('lol', 'ok');
				}}
			>
				Update Object
			</Button>

			<Button
				onClick={() => {
					// setObject((prev) => {
					// 	return { ok: !prev.ok };
					// });
					// setSearchParams(qs.stringify(myObj, { encode: false }));
					// searchParams.set('lol', 'ok');
					// console.log('====================================');
					// console.log('###', qs.parse(searchParams.toString()));
					// console.log('====================================');
				}}
			>
				Update Object
			</Button>
		</Box>
	);
};

export default Blank;
