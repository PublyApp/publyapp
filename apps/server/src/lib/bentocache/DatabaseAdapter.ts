// /**
//  * Interface for a DatabaseAdapter that can be used with the DatabaseDriver
//  */
// export interface DatabaseAdapter {
// 	/**
// 	 * Set the table name for the adapter
// 	 */
// 	setTableName(tableName: string): void;

// 	/**
// 	 * Get an entry from the database
// 	 */
// 	get(key: string): Promise<{ value: any; expiresAt: number | null } | undefined>;

// 	/**
// 	 * Delete an entry from the database
// 	 *
// 	 * You should return true if the entry was deleted, false otherwise
// 	 */
// 	delete(key: string): Promise<boolean>;

// 	/**
// 	 * Delete multiple entries from the database
// 	 *
// 	 * Should return the number of entries deleted
// 	 */
// 	deleteMany(keys: string[]): Promise<number>;

// 	/**
// 	 * Disconnect from the database
// 	 */
// 	disconnect(): Promise<void>;

// 	/**
// 	 * Create the cache table if it doesn't exist
// 	 *
// 	 * This method is responsible for checking it the table
// 	 * exists before creating it
// 	 */
// 	createTableIfNotExists(): Promise<void>;

// 	/**
// 	 * Remove expired entries from the cache table
// 	 */
// 	pruneExpiredEntries(): Promise<void>;

// 	/**
// 	 * Clear all entries from the cache table
// 	 */
// 	clear(prefix: string): Promise<void>;

// 	/**
// 	 * Set a value in the cache
// 	 * You should also make sure to not create duplicate entries for the same key.
// 	 * Make sure to use `ON CONFLICT` or similar
// 	 */
// 	set(row: { key: string; value: any; expiresAt: Date | null }): Promise<void>;
// }
