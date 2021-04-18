export class Service {
	onrequest(request: ServiceRequest) {}
	onerror(request: ServiceRequest) {}
}

export class ServiceRequest {
	constructor(public req, public controller: Service, public handler, public params) {}

	aborted = false;
	data;

	abort() {
		this.aborted = true;
	}

	async execute() {
		this.controller.onrequest && await this.controller.onrequest(this);

		if (!this.aborted) {
			this.data = await this.handler(this.controller, this.params);
		}
	}
}