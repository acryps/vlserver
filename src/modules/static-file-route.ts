import { ServerModule } from "..";
import { BaseServer } from "../server";
import * as express from "express";

export class StaticFileRoute implements ServerModule {
	constructor(
		private route: string,
		private files: string
	) {}

	install(server: BaseServer) {
		server.app.use(this.route, express.static(this.files));
	}
}