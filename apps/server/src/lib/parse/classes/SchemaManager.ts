import _ from 'lodash';
import type { Schema } from 'parse-server';
import _MongoSchemaCollection from 'parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection.js';
import asyncJs from 'async';
import { MongoServerError, type CreateIndexesOptions } from 'mongodb';
import { className as _className, isBun } from '@org/shared/lib/constants';
import { logger } from '@/server/lib/winston';
import { tryCatchWrapper } from '@/shared/utils/try-catch.utils';
import { DEFAULT_CLP } from '../../constants';
import { getDatabase } from '../parse.utils';

let MongoSchemaCollection = _MongoSchemaCollection.default;

if (isBun) {
	MongoSchemaCollection = _MongoSchemaCollection as never;
}

export type ManagedIndex = {
	keys: Record<string, 1 | -1>;
	options?: Omit<CreateIndexesOptions, 'name'>;
};
export type ManagedIndexes = Record<string, ManagedIndex>;

// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
export type SchemaCustom<T extends Record<string, any> = Record<string, any>> =
	ReturnType<typeof SchemaManager.defineSchema<T>>;

// biome-ignore lint/complexity/noStaticOnlyClass: no
export default class SchemaManager {
	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
	static defineSchema<T extends Record<string, any> = Record<string, any>>(
		className: string,
		schema: Partial<Omit<Schema<T>, 'fields' | 'indexes'>> &
			Pick<Schema<T>, 'fields'> & { indexes?: ManagedIndexes },
	) {
		const fields = schema.fields || undefined;
		const classLevelPermissions = schema.classLevelPermissions || DEFAULT_CLP;
		const indexes = schema.indexes || {};

		return {
			className,
			fields,
			classLevelPermissions,
			indexes,
		};
	}

	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
	static defineMultiTenantSchema<T extends Record<string, any>>(
		className: string,
		schema: Partial<Omit<Schema<T>, 'fields' | 'indexes'>> &
			Pick<Schema<T>, 'fields'> & { indexes?: ManagedIndexes },
	) {
		const schemaFields = schema.fields || {};
		_.set(schemaFields, 'tenant', {
			type: 'Pointer',
			required: true,
			targetClass: _className.TENANT,
		});

		schema.fields = schemaFields;

		return SchemaManager.defineSchema(className, schema);
	}

	static async updateSchemas(schemas: SchemaCustom[]) {
		const db = getDatabase();
		const SchemaCollection = db.collection(_className.SCHEMA);

		await asyncJs.eachOfLimit(schemas, 10, async (schemaDefinition) => {
			const wrappedFunction = tryCatchWrapper({
				handler: async () => {
					logger.info(
						`started to update schema '${schemaDefinition.className}'`,
					);

					const inputSchemaObjectFields: Record<string, string> = {};

					const inputSchemaObjectFieldOptions: {
						_metadata: {
							// class_permissions?: CPLsInterface;
							// managed_indexes?: Record<string, Omit<CreateIndexesOptions, 'name'>>;

							fields_options?: Record<
								string,
								// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
								{ defaultValue?: any; required?: boolean }
							>;
						};
					} = { _metadata: {} };

					const inputSchemaObjectIndexes: {
						_metadata: {
							// class_permissions?: CPLsInterface;
							managed_indexes?: ManagedIndexes;
							// fields_options?: Record<string, { defaultValue?: any; required?: boolean; }>
						};
					} = { _metadata: {} };

					const ClassCollection = db.collection(schemaDefinition.className);

					const fillManagedIndexesPromise = asyncJs.eachOfLimit(
						_.entries(schemaDefinition.indexes),
						5,
						async ([indexName, indexDefinition]) => {
							// const indexExists =  await ClassCollection.indexExists(indexName);

							// if (indexExists) {
							// 	await ClassCollection.dropIndex(indexName);
							// }

							try {
								await ClassCollection.createIndex(indexDefinition.keys, {
									name: indexName,
									...indexDefinition.options,
								});
							} catch (error) {
								if (error instanceof MongoServerError) {
									logger.warn(error.message);

									if (
										error.message.startsWith(
											'An existing index has the same name as the requested index.',
										)
									) {
										await ClassCollection.dropIndex(indexName);

										await ClassCollection.createIndex(indexDefinition.keys, {
											name: indexName,
											...indexDefinition.options,
										});
									} else if (
										error.message.startsWith(
											'Index already exists with a different name: ',
										)
									) {
										const oldIndexName = error.message.replace(
											'Index already exists with a different name: ',
											'',
										);

										await ClassCollection.dropIndex(oldIndexName);

										await ClassCollection.createIndex(indexDefinition.keys, {
											name: indexName,
											...indexDefinition.options,
										});
									}
								} else {
									throw error;
								}
							}

							_.set(
								inputSchemaObjectIndexes,
								`_metadata.managed_indexes.${indexName}`,
								indexDefinition,
							);
						},
					);

					_.forEach(
						_.entries(schemaDefinition.fields),
						([fieldName, value]) => {
							inputSchemaObjectFields[fieldName] =
								MongoSchemaCollection.parseFieldTypeToMongoFieldType({
									type: value.type,
									targetClass: value.targetClass,
								});

							if (_.isBoolean(value.required)) {
								_.set(
									inputSchemaObjectFieldOptions,
									`_metadata.fields_options.${fieldName}.required`,
									value.required,
								);
							}

							if (!_.isNil(value.defaultValue)) {
								_.set(
									inputSchemaObjectFieldOptions,
									`_metadata.fields_options.${fieldName}.defaultValue`,
									value.defaultValue,
								);
							}
						},
					);

					const oldSchemaObject = await SchemaCollection.findOne({
						_id: schemaDefinition.className as never,
					});

					await fillManagedIndexesPromise;

					const newSchemaObject = _.merge(
						{},
						oldSchemaObject || ({} as unknown as typeof oldSchemaObject),
						inputSchemaObjectFields,
						inputSchemaObjectFieldOptions,
					);

					_.set(newSchemaObject, '_metadata.managed_indexes', {
						..._.get(newSchemaObject, '_metadata.managed_indexes'),
						..._.get(inputSchemaObjectIndexes, '_metadata.managed_indexes'),
					});
					_.set(
						newSchemaObject,
						'_metadata.class_permissions',
						schemaDefinition.classLevelPermissions,
					);

					await SchemaCollection.updateOne(
						{
							_id: schemaDefinition.className as never,
						},
						{
							$set: newSchemaObject,
						},
						{ upsert: true },
					);

					logger.info(
						`Finished updating schema '${schemaDefinition.className}'`,
					);
				},
				onError: (error) => {
					logger.error(
						`Error while updating schema '${schemaDefinition.className}': \n`,
						error,
					);
				},
			});

			return wrappedFunction();
		});
	}
}
