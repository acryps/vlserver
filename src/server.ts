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
			console.log(this.app._router.stack.filter(r => r.route).map(r => r.route.path));
		});
	}

	expose<TController>(id: string, controller: TController, paramMappings: { [key: string]: any }, handler: (controller: TController, params: any) => any) {
		this.app.get(`/${id}`, async (req, res) => {
			try {
				let data = await handler(controller, {});

				if (data && typeof data == "object" && "resolveToJSON()" in data) {
					data = await data.resolveToJSON();
				}

				res.json({
					data
				});
			} catch (e) {
				res.json({
					error: e + ""
				});
			} 
		});
	}
}