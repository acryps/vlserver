import fs = require("fs");
import { compileServices } from "./compile";

const args = process.argv.slice(2);

switch (args[0]) {
	case "compile":
		try {
			compileServices();
		} catch (e) {
			console.error(e);
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