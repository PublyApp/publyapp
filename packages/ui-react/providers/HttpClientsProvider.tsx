// import { createContext } from 'react';

// import type { AxiosHttp } from '@/shared/lib/axios';

// import type ParseApi from '../api/parse/ParseApi';

// type Clients<T extends ParseApi = ParseApi> = {
// 	parseApi: T;
// 	http: AxiosHttp; // a default axios instance
// };

// export const HttpClientsContext = createContext<Clients | undefined>(undefined);

// type Props<T extends ParseApi = ParseApi> = {
// 	clients: Clients<T>;
// 	children: React.ReactNode;
// };

// /**
//  * ! use for dependency injection purpose only
//  */
// const HttpClientsProvider = ({ clients, children }: Props) => {
// 	return <HttpClientsContext.Provider value={clients}>{children}</HttpClientsContext.Provider>;
// };

// export default HttpClientsProvider;
