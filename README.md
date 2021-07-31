[![npm version](http://badge.acryps.com/npm/vlserver)](http://badge.acryps.com/go/npm/vlserver)
![vlquery](http://badge.acryps.com/vlquery)

<img src="doc/logo.svg" height="50">

# vlserver API Binder
vlserver automates api interfaces by automatically binding Services and ViewModels from the server to clients.

> This package **requires** [vlquery](https://npmjs.com/vlquery).

## Documentation
[Getting Started](doc/getting-started.md)<br>
[Adapters](doc/adapters.md)<br>

## Example
Declare view models on the server
```
export class AuthorViewModel extends ViewModel<Person> {
	id;

	firstname;
	lastname;
}

export class BookViewModel extends ViewModel<Book> {
	id;

	name;
	author: AuthorViewModel;
}
```

Create a service on the server
```
export class BookService extends Service {
	constructor(
		private db: DbContext
	) {
		super();
	}

	getBooks() {
		return BookViewModel.from(this.db.book);
	}
}
```

You can use the service in your client (after generating the bindings with `vlserver compile`)
```
const service = new BookService();
service.getBooks().then(books => {
	console.log(books); // [ BookViewModel, BookViewModel, ... ]
});
```