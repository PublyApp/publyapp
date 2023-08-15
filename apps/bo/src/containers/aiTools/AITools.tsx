import { useMemo, useState } from 'react';

import {
	MaterialReactTable,
	type MRT_ColumnDef,
	// type MRT_ColumnFiltersState,
	type MRT_PaginationState,
	// type MRT_SortingState,
} from 'material-react-table';
import { Box } from '@mui/material';

import { useGetAITools } from '@aktiveo/ui-react/query/features/aiTools/aiTool.hooks';
import { pxToRem } from '@aktiveo/ui-react/utils/styles';
import { AITool } from '@aktiveo/shared/types/aiTool.types';

// const pricingType = {
// 	FREE: 'free',
// 	FREEMIUM: 'freemium',
// 	PAID: 'paid',
// } as const;

// const pricingModel = {
// 	PAY_PER_USE: 'pay-per-use',
// 	SUBSCRIPTION: 'subscription',
// 	FREE: 'free',
// } as const;

// type PricingType = (typeof pricingType)[keyof typeof pricingType];
// type PricingModel = (typeof pricingModel)[keyof typeof pricingModel];

// type AITool = {
// 	name: string;
// 	description: string;
// 	tags: string[];
// 	pricingType: PricingType;
// 	pricingModel: PricingModel;
// };

// const fakeAITools: AITool[] = [
// 	{
// 		name: 'AIAnalyzer',
// 		description: 'Advanced AI analysis tool for data insights',
// 		tags: ['analytics', 'machine learning', 'data science'],
// 		pricingType: 'paid',
// 		pricingModel: 'subscription',
// 	},
// 	{
// 		name: 'NeuraVision',
// 		description: 'Image recognition and classification AI',
// 		tags: ['computer vision', 'image processing'],
// 		pricingType: 'paid',
// 		pricingModel: 'pay-per-use',
// 	},
// 	{
// 		name: 'LanguageGenius',
// 		description: 'Natural language processing and generation',
// 		tags: ['NLP', 'language models'],
// 		pricingType: 'paid',
// 		pricingModel: 'subscription',
// 	},
// 	{
// 		name: 'DeepPredict',
// 		description: 'Predictive modeling with deep learning',
// 		tags: ['predictive analytics', 'neural networks'],
// 		pricingType: 'paid',
// 		pricingModel: 'subscription',
// 	},
// 	{
// 		name: 'AutoCoder',
// 		description: 'Code generation and optimization AI',
// 		tags: ['programming', 'code analysis'],
// 		pricingType: 'paid',
// 		pricingModel: 'pay-per-use',
// 	},
// 	{
// 		name: 'RoboTrader',
// 		description: 'AI-powered stock trading algorithm',
// 		tags: ['finance', 'trading', 'investment'],
// 		pricingType: 'paid',
// 		pricingModel: 'subscription',
// 	},
// 	{
// 		name: 'HealthAI',
// 		description: 'Healthcare data analysis and diagnosis support',
// 		tags: ['medical', 'healthcare'],
// 		pricingType: 'paid',
// 		pricingModel: 'subscription',
// 	},
// 	{
// 		name: 'CyberShield',
// 		description: 'AI-driven cybersecurity platform',
// 		tags: ['cybersecurity', 'threat detection'],
// 		pricingType: 'paid',
// 		pricingModel: 'subscription',
// 	},
// 	{
// 		name: 'EnviroSense',
// 		description: 'Environmental data monitoring and analysis',
// 		tags: ['environment', 'sustainability'],
// 		pricingType: 'paid',
// 		pricingModel: 'free',
// 	},
// 	{
// 		name: 'VirtualAssistant',
// 		description: 'AI-powered virtual assistant for productivity',
// 		tags: ['virtual assistant', 'productivity'],
// 		pricingType: 'paid',
// 		pricingModel: 'free',
// 	},
// ];

const AITools = () => {
	const [pagination, setPagination] = useState<MRT_PaginationState>({
		pageIndex: 0,
		pageSize: 25,
	});

	const columns = useMemo<MRT_ColumnDef<AITool>[]>(() => {
		return [
			{
				header: 'name',
				accessorKey: 'name',
			},
			{
				header: 'pricing model',
				accessorKey: 'pricingModel',
			},
			{
				header: 'tags',
				accessorKey: 'tags',
			},
		];
	}, []);

	const {
		result: { data: aiToolsData },
	} = useGetAITools({ page: pagination.pageIndex + 1, pageSize: pagination.pageSize });

	return (
		<Box padding={pxToRem(32)}>
			<MaterialReactTable
				columns={columns}
				/* data={data?.data ?? []} */
				data={aiToolsData ?? []}
				manualPagination
				onPaginationChange={setPagination}
				// muiTableProps={{
				// 	sx: {
				// 		padding: pxToRem(32),
				// 	},
				// }}
				state={{
					pagination,
				}}
			/>
		</Box>
	);
};

export default AITools;
