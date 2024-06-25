import { JSONResolvable } from "./resolve";
import { DbSet, Entity, QueryProxy, Queryable, PrimaryReference, ForeignReference } from "vlquery";

export class ViewModel<TModel> implements JSONResolvable {
	static mappings: any; // global mappings injected by server routing
	static globalFetchingContext;
	protected $$model: TModel; // model proxy
	private $$source?: TModel;
	private $$createdFromScratch = false;

	// how many levels of a property referencing the same view model should be preloaded
	// works with indirect chains too!
	static maximumPrefetchingRecursionDepth = 1;

	constructor(source?: TModel) {
		if (arguments.length) {
			this.$$source = source;
		} else {
			this.$$createdFromScratch = true;
		}
	}

	async toModel() {
		return await ViewModel.mappings[this.constructor.name].toModel(this) as TModel;
	}

	static async from(data: any[] | Queryable<any, any>): Promise<UnknownFromResult> {
		const viewModel = this;

		// resolve queries
		if ("toArray" in data && typeof data.toArray == "function") {
			return (
				await data.include(ViewModel.mappings[this.name].items).toArray()
			).map(s => new viewModel(s));
		}

		const sources = data as any[];

		// return nothing if no sources are present
		if (!sources.length) {
			return [];
		}

		const firstModel = sources[0] as any;

		// check if the data is a database entity
		if ("$$meta" in firstModel && "id" in firstModel) {
			const mapping = ViewModel.mappings[this.name].items;
			const set = firstModel.$$meta.set as DbSet<Entity<QueryProxy>, QueryProxy>;
			const ids = sources.map(s => (s as unknown as Entity<QueryProxy>).id);

			// create include tree
			const referencedTypes = {
				id: true
			};

			for (let key in mapping) {
				// only load references because we already have the properties of the base type
				if (typeof mapping[key] == "object") {
					referencedTypes[key] = mapping[key];
				}
			}

			// load remaining data
			const data = await (set as any).where(item => item.id.includedIn(ids)).includeTree(referencedTypes).toArray();

			// assign prefetched data to sources
			for (let item of sources) {
				const prefetched = data.find(i => i.id == (item as any).id);

				// go thru all the prefetched items
				for (let key in mapping) {
					if (typeof mapping[key] == "object") {
						item[key]["$stored"] = prefetched[key]["$stored"];
					}
				}
			}

			console.warn(`[performance] post-fetching for '${viewModel.name}' can be optimized by using .include() in the manager or by passing the queryable`);
		}

		return sources.map(s => new viewModel(s));
	}

	async resolveToJSON() {
		let source = this.$$source;

		const mapping = ViewModel.mappings[this.constructor.name];
		
		if (this.$$createdFromScratch) {
			const mapped: any = {};

			for (let property in this) {
				const child = this[property] as any;

				if (typeof child == "object" && child && "resolveToJSON" in child) {
					mapped[property] = await child.resolveToJSON();
				} else {
					mapped[property] = child;
				}
			}

			return mapped;
		}

		if (!source) {
			return null;
		}
		
		const tree = mapping.items;
		
		// use backload to fill all missing items required for the view model in entity at once
		if (source instanceof Entity) {
			await source.backload(tree);
			
			const resolve = (object, tree) => {
				const resolved = {};
				
				for (let key in tree) {
					if (object[key] instanceof PrimaryReference) {
						resolved[key] = object[key]['$stored']?.map(item => resolve(item, tree[key])) ?? [];
					} else if (object[key] instanceof ForeignReference) {
						if (object[key]['$stored']) {
							resolved[key] = resolve(object[key]['$stored'], tree[key]);
						} else {
							resolved[key] = null;
						}
					} else {
						resolved[key] = object[key];
					}
				}
				
				return resolved;
			};
	
			return resolve(source, tree);
		}
		
		// convert objects to JSON
		const resolve = async (object, tree) => {
			const resolved = {};
			
			for (let key in tree) {
				const item = object[key];
				
				if (typeof item == 'object' && item && 'resolveToJSON' in item) {
					resolved[key] = await item.resolveToJSON();
				} else if (typeof item == 'object' && item && Array.isArray(item)) {
					resolved[key] = await Promise.all(item.map(item => item.resolveToJSON()));
				} else {
					resolved[key] = item;
				}
			}
			
			return resolved;
		};
		
		return await resolve(source, tree);
	}
}

// proxy class
// typescript does not allow this type references in static methods
//  https://github.com/microsoft/TypeScript/issues/5863
//
// we use this instead, it will be replaced with the correct type
// by getting the first non null and non error return path of the service method
export class UnknownFromResult {}
