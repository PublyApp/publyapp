import _ from 'lodash';
import type { PipelineStage } from 'mongoose';
import { getDatabase } from './parse.utils';

/**
 * Fetches missing attributes on Parse objects by querying the database directly.
 * This function is useful when Parse objects don't have all their attributes loaded
 * and you need to fetch specific missing attributes efficiently.
 */
export const fetchAttributesOnObjects = async <
	T extends Parse.Object = Parse.Object,
>(
	objects: T[],
	attributes: string[],
): Promise<T[]> => {
	if (_.isEmpty(objects)) {
		return [] as T[];
	}

	const classNames: string[] = [];
	// const objectsMapById = new Map<string, Parse.Object>();

	_.forEach(objects, (object) => {
		if (!object.id) {
			throw new Error('Object has no id');
		}
		if (classNames.length > 1) {
			throw new Error(
				'Cannot fetch attributes on objects with different class names',
			);
		}
		classNames.push(object.className);
		// objectsMapById.set(object.id, object);
	});

	const objectsToFetchMap = new Map<
		string,
		{
			object: Parse.Object;
			attributes: string[];
		}
	>();

	_.forEach(objects, (object) => {
		const missingAttributes = attributes.filter(
			(attribute) => !object.get(attribute),
		);
		if (!_.isEmpty(missingAttributes)) {
			objectsToFetchMap.set(object.id, {
				object,
				attributes: missingAttributes,
			});
		}
	});

	const Collection = getDatabase().collection(classNames[0]);

	const facetMatch: Record<string, PipelineStage[]> = {};

	objectsToFetchMap.forEach((objectToFetch, objectId) => {
		facetMatch[objectId] = [
			{
				$match: {
					_id: objectId,
				},
			},
			{
				$project: {
					_id: 1,
					...objectToFetch.attributes,
				},
			},
		];
	});

	const aggregateResult = Collection.aggregate([
		{
			$match: {
				_id: {
					$in: objects.map((object) => object.id),
				},
			},
		},
		{
			$facet: facetMatch,
		},
	]);

	const aggregateResultArray = await aggregateResult.toArray();

	return _.map(objects, (object) => {
		const clone = object.clone();
		clone.id = object.id;

		const newAttributes = _.get(aggregateResultArray[0], object.id);

		if (!newAttributes) {
			return clone;
		}

		const missingAttributes =
			objectsToFetchMap.get(object.id)?.attributes || [];

		clone.set(_.pick(newAttributes, missingAttributes));
		return clone;
	});
};
