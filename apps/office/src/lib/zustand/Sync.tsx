// import { useEffect } from 'react';

// import _ from 'lodash';
// import { useSearchParams } from 'react-router-dom';

// import { useMainStore } from './store';

// const Sync = () => {
// 	const [searchParams] = useSearchParams();
// 	// const store = useMainStore();

// 	useEffect(() => {
// 		// window.onpopstate = () => {
// 		// console.log(decodeURIComponent(searchParams.toString()));
// 		// const str = decodeURIComponent(searchParams.get('store') || '{}');
// 		// const val = JSON.parse(str);
// 		// const currState = useMainStore.getState();
// 		// const merged = _.merge(currState, val.state);
// 		// useMainStore.setState(merged);
// 		// };
// 		console.log(decodeURIComponent(searchParams.toString()));
// 		const str = decodeURIComponent(searchParams.get('store') || '{}');
// 		const val = JSON.parse(str);
// 		console.log('val', val);
// 		const currState = useMainStore.getState();
// 		console.log('currState', currState);
// 		const merged = _.merge(currState, val.state);
// 		console.log('merged', JSON.stringify(merged));
// 		useMainStore.setState(merged, true);
// 	}, [searchParams]);

// 	return null;
// };

// export default Sync;
