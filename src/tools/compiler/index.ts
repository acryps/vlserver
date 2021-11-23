import * as ts from "typescript";
import * as fs from "fs";
import * as pathtools from "path";
import { Context } from "./context";
import { config } from "../config";
import { Import } from "./import";
import { Service } from "./service";
import { ViewModel } from "./view-model";

export class Compiler {
    context: Context;

    constructor() {
        this.context = new Context(config);
    }

    run() {
        for (let dir of config.services.scan) {
            this.scan(pathtools.resolve(dir));
        }
    }

    scan(directory: string) {
        const compilerOptions = ts.parseJsonConfigFileContent(
            ts.readConfigFile(
                `${directory}/tsconfig.json`, 
                ts.sys.readFile
            ).config,
            ts.sys,
            directory
        );

        const serviceFiles = [];

        function scanDirectory(directory: string) {
            for (let item of fs.readdirSync(directory)) {
                const path = `${directory}/${item}`;
    
                if (fs.lstatSync(path).isDirectory()) {
                    scanDirectory(path);
                } else if (path.endsWith("service.ts")) {
                    serviceFiles.push(path);
                } else if (path.endsWith(".ts") && fs.readFileSync(path).toString().match(/extends\s+ViewModel\</)) {
                    serviceFiles.push(path);
                }
            }
        }
    
        scanDirectory(directory);
    
        const program = ts.createProgram([
            directory,
            ...serviceFiles
        ], compilerOptions.options);
    
        const typeChecker = program.getTypeChecker();
        
        for (let path of serviceFiles) {
            this.compile(path, program, typeChecker);
        }

        console.log(this.context);
    }

    compile(path: string, program: ts.Program, typeChecker: ts.TypeChecker) {
        const sourceFile = program.getSourceFile(path);

        ts.transform(sourceFile, [
            <T extends ts.Node>(context: ts.TransformationContext) => (rootNote: T) => {
                const visit = (node: ts.Node) => {
                    switch (node.kind) {
                        case ts.SyntaxKind.ImportDeclaration: {
                            this.context.imports.push(...Import.from(this.context, path, node as ts.ImportDeclaration, sourceFile))

                            break;
                        }

                        case ts.SyntaxKind.ClassDeclaration: {
                            if (Service.isService(node as ts.ClassDeclaration)) {
                                this.context.services.push(Service.from(node as ts.ClassDeclaration, typeChecker, this.context, context));
                            }

                            if (ViewModel.isViewModel(node as ts.ClassDeclaration)) {
                                this.context.viewModels.push(ViewModel.from(this.context, path, node as ts.ClassDeclaration, typeChecker))
                            }

                            break;
                        }
                    }

                    return ts.visitEachChild(node, visit, context);
                };

                return ts.visitNode(rootNote, visit);
            }
        ])
    }
}