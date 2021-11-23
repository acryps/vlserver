import fs = require("fs");
import { Compiler } from "./compiler";

const args = process.argv.slice(2);

switch (args[0]) {
	case "compile":
		try {
			const compiler = new Compiler();
			compiler.run();
		} catch (e) {
			console.error(e);

			process.exit(1);
		}

		break;

	case "version":
		const config = JSON.parse(fs.readFileSync(`${__dirname}/../../package.json`).toString());

		console.log(`vlserver v${config.verison}`);

		break;

	default: {
		console.warn(`invalid command: ${args[0]}`);
		console.group();
		console.log("compile: Compile services");
		console.log("version: Print vlserver version");
		console.groupEnd();

		process.exit(1);
	}
}