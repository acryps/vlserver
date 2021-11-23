import { Enumeration } from "./enum";
import { Import } from "./import";
import { Inject } from "./inject";
import { Service } from "./service";
import { ViewModel } from "./view-model";

export class Context {
    injectors: Inject[] = [];
    services: Service[] = [];
    imports: Import[] = [];
    viewModels: ViewModel[] = [];
    enumerations: Enumeration[] = [];

    constructor(
        public config
    ) {}
}