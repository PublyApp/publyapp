import { useEffect } from 'react';

import { Typography, Button, FormControl, InputLabel, Select, MenuItem, SelectChangeEvent } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { AppLocale } from '@aktiveo/shared/i18n/resources';
import { User } from '@aktiveo/shared/parse/classes/user.class';
import { classNames } from '@aktiveo/shared/utils/constants';

import { useApp } from '../../hooks/useApp';

const helloAction = async () => {
	try {
		return Parse.Cloud.run('hello') as any;
	} catch (error) {
		return Promise.reject(error);
	}
};

const dummyAction = async () => {
	try {
		// return Parse.Cloud.run('hello') as any;
		// const user = new User({
		// });
		const q = new Parse.Query(classNames.USER);

		const users: User[] = (await q.findAll()) as any;

		console.log('-------users', users);

		const user = new User();
		user.set('ok', 'ok');
		users.push(user);

		return users.map((_user) => {
			return _user.toJSON();
		});
		// return users;
	} catch (error) {
		return Promise.reject(error);
	}
};

const Home = () => {
	const { setBreadcrumbs, setLocale, locale } = useApp();

	const handleChangeLocale = (e: SelectChangeEvent) => {
		setLocale(e.target.value as AppLocale);
	};

	const { /*  _data, */ refetch: sayHello } = useQuery({
		queryKey: ['sayHello'],
		queryFn: helloAction,
		enabled: false,
		// onSuccess: (result) => {
		// 	// eslint-disable-next-line no-alert
		// 	alert(result);
		// },
	});

	const { /*  _data, */ refetch: dummyRun } = useQuery({
		queryKey: ['dummy'],
		queryFn: dummyAction,
		enabled: false,
		// onSuccess: (result) => {
		// 	// eslint-disable-next-line no-alert
		// 	// alert(result);
		// 	console.log(result);
		// },
	});

	useEffect(() => {
		setBreadcrumbs([
			{
				link: 'contact',
				text: 'Contact',
			},
			{
				link: 'contact',
				text: 'Contact',
			},
		]);
	}, [setBreadcrumbs]);

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

			<Button
				variant="contained"
				onClick={() => {
					dummyRun();
				}}
			>
				Run Dummy
			</Button>

			{/* <pre>{JSON.stringify(data, null, 2)}</pre> */}

			<FormControl fullWidth>
				<InputLabel id="demo-simple-select-label">Language</InputLabel>
				<Select
					labelId="demo-simple-select-label"
					id="demo-simple-select"
					value={locale}
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
