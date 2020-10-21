import * as express from "express";
import { ViewModel } from ".";

export class BaseServer {
	app: express.Application;

	prepareRoutes() {}

	modules: [];

	constructor() {
		this.app = express();
	}

	start(port: number) {
		// prepare routes registered by generated managed server
		this.prepareRoutes();

		this.app.get("*", (req, res) => {
			res.json("works");
		})

		// start express server
		this.app.listen(port, () => {
			console.log(`app started on ${port}`);
		});
	}

	expose<TController>(id: string, controller: TController, paramMappings: { [key: string]: any }, handler: (controller: TController, params: any) => any) {
		this.app.get(`/${id}`, async (req, res) => {
			console.log(`request`);

			try {
				let data = await handler(controller, {});

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