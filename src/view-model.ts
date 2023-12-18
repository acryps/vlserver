import { JSONResolvable } from "./resolve";
import { DbSet, Entity, QueryProxy, Queryable } from "vlquery";

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

		const mapper = (new mapping()).map.bind({
			$$model: source
		});

		const mapped = await mapper();

		// this resolves all the ViewModels within this ViewModel
		// this not not recursive for performance and maintanance reasons
		// a ViewModel should NOT contain an object which cannot be resolved to JSON using "resolveToJSON"
		for (let property in mapped) {
			if (typeof mapped[property] == "object" && mapped[property] && "resolveToJSON" in mapped[property]) {
				mapped[property] = await mapped[property].resolveToJSON();
			} else if (Array.isArray(mapped[property])) {
				for (let i = 0; i < mapped[property].length; i++) {
					if (mapped[property][i] && typeof mapped[property][i] == "object" && "resolveToJSON" in mapped[property][i]) {
						mapped[property][i] = await mapped[property][i].resolveToJSON();
					}
				}
			}
		}

		return mapped;
	}
}

// proxy class
// typescript does not allow this type references in static methods
//  https://github.com/microsoft/TypeScript/issues/5863
//
// we use this instead, it will be replaced with the correct type
// by getting the first non null and non error return path of the service method
export class UnknownFromResult {}
