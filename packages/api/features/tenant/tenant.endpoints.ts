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
		const multerLikeFile = {
			originalname: logo.name,
			mimetype: logo.type,
			size: logo.size,
			buffer: await logo.arrayBuffer(),
			// Autres propriétés requises par votre UploadAdapter...
		};

		console.log('Session token:', this.parseRestClient.getSessionToken());
		console.log(
			'Default upload adapter type:',
			typeof FileService.defaultUploadAdapter,
		);
		console.log(
			'Default upload adapter instance:',
			FileService.defaultUploadAdapter,
		);

		// Vérification du type
		if (!('upload' in FileService.defaultUploadAdapter)) {
			throw new Error('Invalid upload adapter type');
		}

		const fileService = new FileService({
			sessionToken: this.parseRestClient.getSessionToken(),
			uploadAdapter: FileService.defaultUploadAdapter,
		});

		const uploadResult = await fileService.uploadOne({
			file: multerLikeFile,
			folderPath: 'tenants/logos',
		});

		console.log('uploadResult', uploadResult);

		/* return this.parseRestClient.http.post<ITenant>(
            this.parseRestClient.serverUrl + endPoint.api.parse.root + '/classes/Tenant',
            {
                name,
                usersCount,
                maxUsers,
                logoUrl: uploadResult.url // URL publique du fichier
            },
            { headers }
        ); */
	}
}
