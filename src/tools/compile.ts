import { config } from "../config";
import * as ts from "typescript";
import * as fs from "fs";

function compile(path) {
	console.log(`COMPILE ${path}`);
}

function scan(directory: string) {
	for (let item of fs.readdirSync(directory)) {
		const path = `${directory}/${item}`;

		if (fs.lstatSync(path).isDirectory()) {
			scan(path);
		} else if (path.endsWith("service.ts")) {
			try {
				compile(path);
			} catch (e) {
				console.error(`Compiling of '${path}' failed!`, e);
			}
		}
	}
}

export function compileServices() {
	for (let dir of config.services.scan) {
		scan(dir);
	}
}