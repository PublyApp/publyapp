import { useContext } from 'react';

import { HttpClientsContext } from '../providers/HttpClientsProvider';

const useHttpClients = () => {
	const clients = useContext(HttpClientsContext);

	if (!clients) {
		throw new Error('useHttpClients must be used within a ParseApiProvider');
	}

	return clients;
};

export default useHttpClients;
