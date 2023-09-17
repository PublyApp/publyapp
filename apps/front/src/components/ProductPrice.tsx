import { Box, Stack, StackProps } from '@mui/material';

import { fCurrency } from '@aktiveo/ui-react/utils/formatNumber';

interface Props extends StackProps {
	price: number;
	priceSale?: number;
}

export const ProductPrice = ({ price, priceSale = 0, sx, ...other }: Props) => {
	return (
		<Stack direction="row" sx={{ typography: 'subtitle2', ...sx }} {...other}>
			{fCurrency(price)}

			<Box
				component="span"
				sx={{
					ml: 0.5,
					color: 'text.disabled',
					textDecoration: 'line-through',
					fontWeight: 'fontWeightMedium',
				}}
			>
				{priceSale > 0 && fCurrency(priceSale)}
			</Box>
		</Stack>
	);
};
