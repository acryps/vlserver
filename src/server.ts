import * as express from "express";
import { RunContext } from "vlquery";
import { Inject, ViewModel, ServiceRequest } from ".";
import { ServerModule } from "./module";
import * as multer from "multer";

export class BaseServer {
	app: express.Application;
	upload; // multer upload handler

	injectors: { [name: string]: (context: RunContext, req, res) => any } = {};

	prepareRoutes() {}

	use(module: ServerModule) {
		module.install(this);
	}

	inject<T>(type: new () => T, resolver: (context: RunContext) => T) {
		this.injectors[type.name] = resolver;
	}

	createRunContext(req, res) {
		return new RunContext();
	}

	createInjector(context: RunContext, req, res) {
		const injects = {};

		for (let name in this.injectors) {
			injects[name] = this.injectors[name](context, req, res);
		}

		return new Inject(injects);
	}

	modules: [];

	constructor() {
		this.app = express();
		this.upload = multer();
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

	expose(id: string, paramMappings: { [key: string]: any }, controllerConstructor: (inject: Inject) => any, handler: (controller, params) => any) {
		const fields = [];

		for (let param in paramMappings) {
			fields.push({
				name: param
			});
		}

		this.app.post(`/${id}`, this.upload.fields(fields), async (req, res) => {
			// create run context
			const context = this.createRunContext(req, res);

			// create injector with DbContext global
			const injector = this.createInjector(context, req, res); 

			// will be constructed
			// scoped here to call onerror in case request fails
			let controller;
			let request;

			try {
				const body = req.body;
				const files = (req as any).files;

				const params = {};

				for (let paramKey in paramMappings) {
					if (paramKey in body || paramKey in files) {
						const parameterParser = this.getParameterParser(paramMappings[paramKey].type);

						if (paramMappings[paramKey].isArray) {
							params[paramKey] = [...JSON.parse(body[paramKey])].map(element => parameterParser(element));
						} else {
							const content = paramKey in files ? files[paramKey][0] : JSON.parse(body[paramKey]);

							params[paramKey] = parameterParser(content);
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

					if (data && typeof data == "object" && data instanceof Buffer) {
						res.end(data);
					} else {
						res.json({
							data
						});
					}
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

	private getParameterParser(type: any): (value: any) => any {
		switch (type) {
			case "string": {
				return value => {
					if (value === null) {
						return null;
					} else {
						return `${value}`;
					}
				}
			}

			case "number": {
				return value => {
					if (value === null) {
						return null;
					} else {
						return +value;
					}
				}
			}

			case "boolean": {
				return value => !!value;
			}

			case "date": {
				return value => {
					if (value === null) {
						return null;
					} else {
						return new Date(value);
					}
				}
			}

			case "buffer": {
				return value => value.buffer;
			}

			default: {
				return value => ViewModel.mappings[type.name].toViewModel(value);
			}
		}
	}

	static async unwrap(value) {
		if (value && "fetch" in value && value.fetch && typeof value.fetch == "function") {
			return await value.fetch();
		}

		return value;
	}
}