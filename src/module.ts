import { BaseServer } from ".";

export interface ServerModule {
	install(server: BaseServer);
}