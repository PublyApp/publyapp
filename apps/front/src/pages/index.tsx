// import Typography from '@mui/material/Typography';

import MainLayout from '@front/components/layout/MainLayout';
import ProductsView from '@front/components/ProductsView';

// import ProductsView from '../components/ProductsView';

const Home = () => {
	return (
		<MainLayout>
			<ProductsView />
			{/* <Typography variant="h1">Next to do is productzs list view with filer on the side</Typography> */}
		</MainLayout>
	);
};

export default Home;
