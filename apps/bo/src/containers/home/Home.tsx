import { useEffect } from 'react';

import { Typography, Button, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { AppLocale } from '@aktiveo/shared/i18n/resources';
import { useApp } from '@aktiveo/ui-react/hooks/useApp';
import { setBreadcrumbs, setLocale } from '@aktiveo/ui-react/contexts/AppProvider';

const helloAction = async () => {
	try {
		return Parse.Cloud.run('hello') as any;
	} catch (error) {
		return Promise.reject(error);
	}
};

const Home = () => {
	const { dispatch, state } = useApp();

	const handleChangeLocale = (e: SelectChangeEvent) => {
		// setLocale(e.target.value as AppLocale);
		dispatch(setLocale(e.target.value as AppLocale));
	};

	const { /*  _data, */ refetch: sayHello } = useQuery({
		queryKey: ['sayHello'],
		queryFn: helloAction,
		enabled: false,
	});

	useEffect(() => {
		dispatch(
			setBreadcrumbs([
				{
					link: 'contact',
					text: 'Contact',
				},
				{
					link: 'contact',
					text: 'Contact',
				},
			]),
		);
	}, [dispatch]);

	return (
		<div>
			<Typography variant="h1">Home</Typography>

			<Button
				variant="contained"
				onClick={() => {
					sayHello();
				}}
			>
				Say Hello
			</Button>

			<Button variant="contained" onClick={() => {}}>
				Run Dummy
			</Button>

			{/* <pre>{JSON.stringify(data, null, 2)}</pre> */}

			<FormControl fullWidth>
				<InputLabel id="demo-simple-select-label">Language</InputLabel>
				<Select
					labelId="demo-simple-select-label"
					id="demo-simple-select"
					value={state.locale}
					label="Age"
					onChange={handleChangeLocale}
				>
					<MenuItem value="en">English</MenuItem>
					<MenuItem value="fr">French</MenuItem>
				</Select>
			</FormControl>
		</div>
	);
};

export default Home;
