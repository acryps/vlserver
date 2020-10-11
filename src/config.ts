import fs = require("fs");
import path = require("path");

let rootFolder = process.cwd();

while (path.parse(rootFolder).root != rootFolder && !fs.existsSync(`${rootFolder}/vlconfig.json`)) {
	rootFolder = path.resolve(rootFolder, "..");
}

if (path.parse(rootFolder).root == rootFolder) {
	throw new Error(`No vlconfig.json configuration found in '${process.cwd()}'!`);
}

const userConfig = JSON.parse(fs.readFileSync(`${rootFolder}/vlconfig.json`).toString());

export const config = {
	root: rootFolder,
	services: {
		outFile: (userConfig.services && userConfig.services.outFile) || "services.ts",
		routingFile: (userConfig.services && userConfig.services.routingFile) || "routing.ts",
		scan: (userConfig.services && userConfig.services.scan) || ["."]
	}
};