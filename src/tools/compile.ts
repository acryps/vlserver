import { config } from "../config";
import * as ts from "typescript";
import * as fs from "fs";

function compile(path) {
	console.log(`COMPILE ${path}`);

	const transformer = <T extends ts.Node>(context: ts.TransformationContext) => (rootNode: T) => {
		function visit(node): ts.Node {
			console.log("Visiting " + ts.SyntaxKind[node.kind]);

			if (node.kind == ts.SyntaxKind.ClassDeclaration) {
				console.log(node);

				const name = node.name.escapedText;

				// check for Service inheritage
				if (node.heritageClauses[0] && node.heritageClauses[0].types[0] && node.heritageClauses[0].types[0].expression.escapedText == "Service") {
					for (let member of node.members) {
						console.log(member);
					}
				}
			}

			return ts.visitEachChild(node, visit, context);
		}

		return ts.visitNode(rootNode, visit);
	};

	ts.transform(
		ts.createSourceFile(path, fs.readFileSync(path).toString(), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS),
		[
			transformer
		]
	);
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