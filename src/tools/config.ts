import fs = require("fs");
import path = require("path");
import { NativeServiceAdapter } from "./adapters/native";
import { ServiceAdapter } from "./adapters/base";
import { AngularServiceAdapter } from "./adapters/angular";

let rootFolder = process.cwd();

while (path.parse(rootFolder).root != rootFolder && !fs.existsSync(`${rootFolder}/vlconfig.json`)) {
	rootFolder = path.resolve(rootFolder, "..");
}

if (path.parse(rootFolder).root == rootFolder) {
	throw new Error(`No vlconfig.json configuration found in '${process.cwd()}'!`);
}

// move process into root folder
process.chdir(rootFolder);

const userConfig = JSON.parse(fs.readFileSync(`vlconfig.json`).toString());

export const config = {
	root: rootFolder,
	services: {
		serverOutFile: (userConfig.services && userConfig.services.serverOutFile) || "server.ts",
		scan: (userConfig.services && userConfig.services.scan) || ["."],
		endpoints: ((userConfig.services && userConfig.services.endpoints) || []).map(item => {
			if (item.type == "native") {
				return new NativeServiceAdapter(item);
			}

			if (item.type == "angular") {
				return new AngularServiceAdapter(item);
			}

			return new ServiceAdapter(item);
		})
	}
};