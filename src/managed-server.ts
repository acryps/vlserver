import * as express from "express";
import { ViewModel } from ".";

export class RootManagedServer {
	app: express.Application;

	prepareRoutes() {}

	modules: [];

	constructor() {
		this.app = express();
	}

	start(port: number) {
		this.app.get("*", (req, res) => {
			res.json("works");
		})

		this.app.listen(port);
	}

	expose<TController>(id: string, controller: TController, handler: (controller: TController) => ViewModel<any>) {
		
	}
}