// import Parse from 'parse';
// import { useEffect } from 'react';

// import {
// 	Box,
// 	Button,
// 	FormControl,
// 	InputLabel,
// 	MenuItem,
// 	Select,
// 	Typography,
// 	type SelectChangeEvent,
// } from '@mui/material';
// import { useQuery } from '@tanstack/react-query';
// import { toast } from 'react-toastify';

// import type { AppLocale } from '@devist/shared/i18n/resources';

// // import { setBreadcrumbs, setLocale } from '@devist/ui-react/contexts/AppProvider';

// import TipTap from '@office/components/tipTap/TipTap';

// const helloAction = async () => {
// 	try {
// 		return Parse.Cloud.run('hello') as any;
// 	} catch (error) {
// 		return Promise.reject(error);
// 	}
// };

// const Home = () => {
// 	// const { dispatch, state } = useApp();

// 	// useEffect(() => {
// 	// 	dispatch(
// 	// 		setBreadcrumbs([
// 	// 			{
// 	// 				link: 'contact',
// 	// 				text: 'Contact',
// 	// 			},
// 	// 			{
// 	// 				link: 'contact',
// 	// 				text: 'Contact',
// 	// 			},
// 	// 		]),
// 	// 	);
// 	// }, [dispatch]);

// 	const handleChangeLocale = (e: SelectChangeEvent) => {
// 		// setLocale(e.target.value as AppLocale);
// 		// dispatch(setLocale(e.target.value as AppLocale));
// 	};

// 	const {
// 		/*  _data, */
// 		refetch: sayHello,
// 		isSuccess,
// 		data,
// 		// isFetching,
// 		// isLoading,
// 		// // isStale,
// 		// isFetched,
// 	} = useQuery({
// 		queryKey: ['sayHello'],
// 		queryFn: helloAction,
// 		enabled: false,
// 		// placeholderData: keepPreviousData,
// 	});

// 	// useEffect(() => {
// 	// 	if (!isFetching && isSuccess && data && data) {
// 	// 		alert(data);
// 	// 	}
// 	// }, [isSuccess, data, isFetching, isLoading]);
// 	useEffect(() => {
// 		if (isSuccess && data) {
// 			// alert(data);
// 			console.log('====================================');
// 			console.log(data);
// 			console.log('====================================');
// 		}
// 	}, [data, isSuccess]);

// 	return (
// 		<Box>
// 			<Typography variant="h1">Home</Typography>

// 			<Button
// 				variant="contained"
// 				onClick={() => {
// 					sayHello();
// 				}}
// 			>
// 				Say Hello
// 			</Button>

// 			<Button variant="contained" onClick={() => {}}>
// 				Run Dummy
// 			</Button>

// 			<Button
// 				variant="contained"
// 				onClick={() => {
// 					console.log('rrrrrrrrrr');

// 					toast('WRYYYY!!', {
// 						position: 'top-right',
// 						autoClose: 5000,
// 						hideProgressBar: false,
// 						closeOnClick: true,
// 						pauseOnHover: true,
// 						draggable: true,
// 						progress: undefined,
// 						theme: 'light',
// 					});
// 				}}
// 			>
// 				Toastify
// 			</Button>

// 			{/* <pre>{JSON.stringify(data, null, 2)}</pre> */}

// 			<FormControl fullWidth>
// 				<InputLabel id="demo-simple-select-label">Language</InputLabel>
// 				<Select
// 					labelId="demo-simple-select-label"
// 					id="demo-simple-select"
// 					value={state.locale}
// 					label="Age"
// 					onChange={handleChangeLocale}
// 				>
// 					<MenuItem value="en">English</MenuItem>
// 					<MenuItem value="fr">French</MenuItem>
// 				</Select>
// 			</FormControl>

// 			<TipTap />
// 		</Box>
// 	);
// };

// export default Home;
