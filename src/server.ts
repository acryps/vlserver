import * as express from "express";
import { RunContext } from "vlquery";
import { Inject, ViewModel, ServiceRequest } from ".";
import { ServerModule } from "./module";
import * as multer from "multer";

export class BaseServer {
	app: express.Application;
	upload; // multer upload handler

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

	createInjector(context: RunContext) {
		return new Inject({
			DbContext: this.createDatabaseContext(context)
		});
	}

	databaseContext: new (context: RunContext) => any | any;
	modules: [];

	constructor() {
		this.app = express();
		this.upload = multer();
	}

	start(port: number) {
		// prepare routes registered by generated managed server
		this.prepareRoutes();

		ViewModel.globalFetchingContext = this.createDatabaseContext(new RunContext());

		this.app.get("*", (req, res) => {
			res.status(404).end("Route not found!");
		});

		// start express server
		this.app.listen(port, () => {
			console.log(`app started on ${port}`);
		});
	}

	expose(id: string, paramMappings: { [key: string]: any }, controllerConstructor: (inject: Inject) => any, handler: (controller, params) => any) {
		const fields = [];

		for (let param in paramMappings) {
			fields.push({
				name: param
			});
		}

		this.app.post(`/${id}`, this.upload.fields(fields), async (req, res) => {
			console.log(`request`);

			// create run context
			const context = this.createRunContext(req, res);

			// create injector with DbContext global
			const injector = this.createInjector(context); 

			// will be constructed
			// scoped here to call onerror in case request fails
			let controller;
			let request;

			try {
				const body = req.body;
				const params = {};

				for (let paramKey in paramMappings) {
					if (paramKey in body) {
						switch (paramMappings[paramKey].type) {
							case "string": {
								if (paramMappings[paramKey].isArray) {
									params[paramKey] = [...JSON.parse(body[paramKey])].map(s => `${s}`);
								} else {
									const value = JSON.parse(body[paramKey]);

									if (value === null) {
										params[paramKey] = null;
									} else {
										params[paramKey] = `${value}`;
									}
								}

								break;
							}

							case "number": {
								if (paramMappings[paramKey].isArray) {
									params[paramKey] = [...JSON.parse(body[paramKey])].map(s => +s);
								} else {
									const value = JSON.parse(body[paramKey]);

									if (value === null) {
										params[paramKey] = null;
									} else {
										params[paramKey] = +value;
									}
								}

								break;
							}

							case "boolean": {
								if (paramMappings[paramKey].isArray) {
									params[paramKey] = [...JSON.parse(body[paramKey])].map(s => !!s);
								} else {
									params[paramKey] = !!JSON.parse(body[paramKey]);
								}

								break;
							}

							case "date": {
								if (paramMappings[paramKey].isArray) {
									params[paramKey] = [...JSON.parse(body[paramKey])].map(s => new Date(s));
								} else {
									const value = JSON.parse(body[paramKey]);

									if (value === null) {
										params[paramKey] = null;
									} else {
										params[paramKey] = new Date(value);
									}
								}

								break;
							}

							default: {
								const ctr = paramMappings[paramKey].type;
								params[paramKey] = ViewModel.mappings[ctr.name].toViewModel(JSON.parse(body[paramKey]));
							}
						}
					}
				}

				controller = controllerConstructor(injector);

				request = new ServiceRequest(req, controller, handler, params);
				await request.execute();

				if (request.aborted) {
					res.json({
						aborted: true
					});
				} else {
					let data = request.data;

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
				}
			} catch (e) {
				console.error(e);

				if (controller && controller.onerror) {
					await controller.onerror(request);
				}

				res.json({
					error: e + "",
					stack: e.stack
				});
			} 
		});
	}
}