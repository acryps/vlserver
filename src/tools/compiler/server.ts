import { Context } from "./context";
import { Import } from "./import";
import { Inject } from "./inject";

export class Server {
    static generateManagedServerFile(context: Context) {
        return `
            import { BaseServer, ViewModel, Inject } from "vlserver";

            ${Import.generateImports(context)}

            ${Inject.createMappings(context.injectors)}

            export class ManagedServer extends BaseServer {
                prepareRoutes() {
                    ${context.services.flatMap(service => service.routes.map(route => route.generatePreparedRoute())).join("\n")}
                }
            }

            ViewModel.mappings = {
                ${context.viewModels}
            };
        `;
    }
}