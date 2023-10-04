import { Skeleton, Table, TableCell, TableRow } from '@mui/material';

type Props = {
	rowsNum?: number;
	colsNum?: number;
};

export const TableLoader = ({ rowsNum = 10, colsNum = 4 }: Props) => {
	return (
		<Table>
			{Array.from({ length: rowsNum }).map((_, index) => {
				return (
					// eslint-disable-next-line react/no-array-index-key
					<TableRow key={index} /* sx={{ mb: 'unset' }} */>
						{Array.from({ length: colsNum }).map((_2, index2) => {
							return (
								// eslint-disable-next-line react/no-array-index-key
								<TableCell key={index2} component={index === 0 ? 'th' : 'td'} sx={{ p: '3px', borderBottom: 'none' }}>
									<Skeleton animation="wave" variant="rectangular" />
								</TableCell>
							);
						})}
					</TableRow>
				);
			})}
		</Table>
	);
};
