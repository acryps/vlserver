import * as express from "express";

export class RootManagedServer {
	app: express.Application;

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
}