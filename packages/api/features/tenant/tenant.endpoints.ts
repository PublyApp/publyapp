import type { ITenant } from '@org/shared/types/db/tenant.types';

import BaseEndPoints, {
	type BaseEndPointsProps,
} from '../../classes/BaseEndPoints';
import { endPoint } from '@/shared/lib/constants';
import FileService from '@/server/modules/common/file/file.service';

export default class TenantEndPoints extends BaseEndPoints {
	constructor({ parseRestClient }: BaseEndPointsProps) {
		super({ parseRestClient });
		this.createTenant = this.createTenant.bind(this);
	}

	async createTenant(input: {
		name: string;
		usersCount: number;
		maxUsers: number;
		logo: File;
	}) {
		const { name, usersCount, maxUsers, logo } = input;

		const headers = {
			'X-Parse-Master-Key': 'local-master-key',
		};

		console.log('Session token:', this.parseRestClient.getSessionToken());

		return this.parseRestClient.http.post<ITenant>(
			this.parseRestClient.serverUrl +
				endPoint.api.parse.root +
				'/classes/Tenant',
			{
				name,
				usersCount,
				maxUsers,
				logoUrl: 'uploadResult.url', // URL publique du fichier
			},
			{ headers },
		);
	}
}
