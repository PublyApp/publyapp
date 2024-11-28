import { DatabaseDriver } from 'bentocache/drivers/database';
import type { CreateDriverResult, DatabaseAdapter, DatabaseConfig } from 'bentocache/types';
import { MongoClient, type Collection, type Db, type MongoClientOptions } from 'mongodb';

interface MongoConfig extends DatabaseConfig, MongoClientOptions {
	uri: string;
}

/**
 * Create a MongoDB driver
 * You will need to install the MongoDB package (`npm install mongodb`)
 */
export const mongoDriver = (options: MongoConfig): CreateDriverResult<DatabaseDriver> => {
	return {
		options,
		factory: (config: MongoConfig) => {
			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			const adapter = new MongoAdapter(config);
			return new DatabaseDriver(adapter, config);
		},
	};
};

/**
 * MongoDB adapter for the DatabaseDriver
 */
export class MongoAdapter implements DatabaseAdapter {
	#client: MongoClient;

	#db!: Db;

	#collection!: Collection;

	#collectionName!: string;

	constructor(config: MongoConfig) {
		this.#client = new MongoClient(config.uri, config);
	}

	setTableName(collectionName: string): void {
		this.#collectionName = collectionName;
		// await this.#client.connect(); // Always ensure the client is connected
		// this.#db = this.#client.db();
		// this.#collection = this.#db.collection(collectionName);
	}

	async createTableIfNotExists(): Promise<void> {
		// MongoDB collections are created implicitly on first use.
		// This is used for index setup.

		if (!this.#collectionName) {
			throw new Error('Collection name is not set. Call setTableName first.');
		}

		await this.#client.connect(); // Always ensure the client is connected
		this.#db = this.#client.db();
		this.#collection = this.#db.collection(this.#collectionName);

		// Setup indexes
		await this.#collection.createIndex({ key: 1 }, { unique: true }); // Unique index for the key
		await this.#collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for automatic expiration
	}

	async get(key: string): Promise<{ value: string; expiresAt: number | null } | undefined> {
		const result = await this.#collection.findOne({ key });
		if (!result) return { value: '', expiresAt: null };
		return { value: result.value, expiresAt: result.expiresAt || null };
	}

	async delete(key: string): Promise<boolean> {
		const result = await this.#collection.deleteOne({ key });
		return result.deletedCount > 0;
	}

	async deleteMany(keys: string[]): Promise<number> {
		const result = await this.#collection.deleteMany({ key: { $in: keys } });
		return result.deletedCount || 0;
	}

	async disconnect(): Promise<void> {
		await this.#client.close();
	}

	async pruneExpiredEntries(): Promise<void> {
		// Explicit prune is optional since the TTL index handles it
		await this.#collection.deleteMany({ expiresAt: { $lt: new Date() } });
	}

	async clear(prefix: string): Promise<void> {
		await this.#collection.deleteMany({ key: { $regex: `^${prefix}` } });
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async set(row: { key: string; value: any; expiresAt: Date | null }): Promise<void> {
		await this.#collection.updateOne(
			{ key: row.key },
			{ $set: { value: row.value, expiresAt: row.expiresAt } },
			{ upsert: true },
		);
	}
}
