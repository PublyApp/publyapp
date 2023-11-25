import { Box, Fab, Link, Stack, type StackProps } from '@mui/material';
import NextLink from 'next/link';

import Iconify from '@devist/ui-react/components/Iconify';
import Image from '@devist/ui-react/components/Image';
import Label from '@devist/ui-react/components/Label';
import TextMaxLine from '@devist/ui-react/components/TextMaxLine';

import { type IProductItemProps } from './ProductList';
import { ProductPrice } from './ProductPrice';
import { ProductRating } from './ProductRating';

interface Props extends StackProps {
	product: IProductItemProps;
}

export const ProductViewGridItem = ({ product, sx, ...other }: Props) => {
	return (
		<Stack
			sx={{
				position: 'relative',
				'&:hover .add-to-cart': {
					opacity: 1,
				},
				...sx,
			}}
			{...other}
		>
			{product.label === 'new' && (
				<Label color="info" sx={{ position: 'absolute', m: 1, top: 0, right: 0, zIndex: 9 }}>
					NEW
				</Label>
			)}

			{product.label === 'sale' && (
				<Label color="error" sx={{ position: 'absolute', m: 1, top: 0, right: 0, zIndex: 9 }}>
					SALE
				</Label>
			)}

			<Box sx={{ position: 'relative', mb: 2 }}>
				<Fab
					component={NextLink}
					// to={paths.eCommerce.product}
					href="/dlkfskpdfksldpkfo"
					className="add-to-cart"
					color="primary"
					size="medium"
					sx={{
						right: 8,
						zIndex: 9,
						bottom: 8,
						opacity: 0,
						position: 'absolute',
						transition: (theme) => {
							return theme.transitions.create('opacity', {
								easing: theme.transitions.easing.easeIn,
								duration: theme.transitions.duration.shortest,
							});
						},
					}}
				>
					<Iconify icon="carbon:shopping-cart-plus" />
				</Fab>

				<Image
					src={product.coverImg}
					sx={{
						flexShrink: 0,
						borderRadius: 1.5,
						bgcolor: 'background.neutral',
					}}
				/>
			</Box>

			<Stack spacing={0.5}>
				<TextMaxLine variant="caption" line={1} sx={{ color: 'text.disabled' }}>
					{product.category}
				</TextMaxLine>

				<Link component={NextLink} href="/dlkfskpdfksldpkfo" color="inherit">
					<TextMaxLine variant="body2" line={1} sx={{ fontWeight: 'fontWeightMedium' }}>
						{product.name}
					</TextMaxLine>
				</Link>

				<ProductPrice price={product.price} priceSale={product.priceSale} />

				<ProductRating rating={product.rating} label={`${product.sold} sold`} />
			</Stack>
		</Stack>
	);
};
