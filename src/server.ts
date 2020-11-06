import * as express from "express";
import { RunContext } from "vlquery";
import { Inject } from ".";
import { ServerModule } from "./module";

export class BaseServer {
	app: express.Application;

	prepareRoutes() {}

	use(module: ServerModule) {
		module.install(this);
	}

	createRunContext(req, res) {
		return new RunContext();
	}

	createDatabaseContext(context: RunContext) {
		if (typeof this.databaseContext == "function") {
			return new this.databaseContext(context);
		}

		if (this.databaseContext) {
			return this.databaseContext;
		}

		return null;
	}

	databaseContext: new (context: RunContext) => any | any;
	modules: [];

	constructor() {
		this.app = express();
	}

	start(port: number) {
		// prepare routes registered by generated managed server
		this.prepareRoutes();

		this.app.get("*", (req, res) => {
			res.status(404).end("Route not found!");
		});

		// start express server
		this.app.listen(port, () => {
			console.log(`app started on ${port}`);
		});
	}

	expose<TController>(id: string, paramMappings: { [key: string]: any }, handler: (inject: Inject, params: any) => any) {
		this.app.post(`/${id}`, async (req, res) => {
			console.log(`request`);

			// create run context
			const context = this.createRunContext(req, res);

			// create injector with DbContext global
			const injector = new Inject({
				DbContext: this.createDatabaseContext(context)
			});

			try {
				let data = await handler(injector, {});

				if (data && typeof data == "object" && "fetch" in data && typeof data.fetch == "function") {
					data = await data.fetch();
				}

				if (data && typeof data == "object" && "toArray" in data && typeof data.toArray == "function") {
					data = await data.toArray();
				}

				if (data && typeof data == "object" && "resolveToJSON" in data && typeof data.resolveToJSON == "function") {
					data = await data.resolveToJSON();
				}

				if (data && Array.isArray(data)) {
					for (let i = 0; i < data.length; i++) {
						if (data[i] && typeof data[i] == "object" && "resolveToJSON" in data[i]) {
							data[i] = await data[i].resolveToJSON();
						}
					}
				}

				res.json({
					data
				});
			} catch (e) {
				res.json({
					error: e + "",
					stack: e.stack
				});
			} 
		});
	}
}