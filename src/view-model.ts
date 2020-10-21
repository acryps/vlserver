import { JSONResolvable } from "./resolve";
import { DbSet, Entity, QueryProxy } from "vlquery";

export class ViewModel<TModel> implements JSONResolvable {
	static mappings: any; // global mappings injected by server routing
	protected model: TModel; // model proxy

	constructor(private source: TModel) {}

	async toModel() {
		return this.model;
	}

	static async from<TModel>(sources: TModel[]) {
		// resolve promises
		sources = await sources;

		// return nothing if no sources are present
		if (!sources.length) {
			return [];
		}

		const viewModel = this;
		const firstModel = sources[0] as any;

		if ("$meta" in firstModel) {
			const mapping = ViewModel.mappings[this.name];
			const set = firstModel.$meta.set as DbSet<Entity<QueryProxy>, QueryProxy>;
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

			const data = await set.where(item => item.id.includedIn(ids)).includeTree(referencedTypes).toArray();

			console.log(data);

			// if () {

			// }
		}

		return sources.map(s => new viewModel(s));
	}

	async resolveToJSON() {
		let source = this.source;

		const mapping = ViewModel.mappings[this.constructor.name];
		const mapper = (new mapping()).map.bind({
			model: source
		});

		const mapped = await mapper();

		// this resolves all the viewmodels within this viewmodel
		// this not not recursive for performance and maintanance reasons
		// a viewmodel should NOT contain an object which cannot be resolved to JSON using "resolveToJSON"
		for (let property in mapped) {
			if (typeof mapped[property] == "object" && "resolveToJSON" in mapped[property]) {
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