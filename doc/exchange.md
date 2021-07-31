# Data Exchange
vlserver exchanges data encoded as JSON inside [FormData (Multipart)](https://developer.mozilla.org/en-US/docs/Web/API/FormData).

Instead of using normal API-routes, vlserver creates hashed routes. This prevents clients from implementing weird custom requests outside of the generated services. Trust us, you don't want to deal with this dependency nightmare. 

Let's break down this request
```
const book: BookViewModel;
const categoryId: string;

const bookService = new BookService();
await bookService.assignCategory(book, categoryId);
```

This will send a POST HTTP request (stripped common and irrelevant HTTP-Headers)
```
POST /JwdzU1M3F2cDIzb3R3MTFxNGp3bGd0dW HTTP/1.1
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryywIrc07RdSzlJJEt

------WebKitFormBoundaryywIrc07RdSzlJJEt
Content-Disposition: form-data; name="puMWwyZmY3OGtmbTgyNXRkYjZ6MGg3aH"

{"id":"0c1a2428-573c-4b73-821b-4b81b3e783d1","title":"An example book"}
------WebKitFormBoundaryywIrc07RdSzlJJEt--

------WebKitFormBoundaryywIrc07RdSzlJJEt
Content-Disposition: form-data; name="kwYmt1c2hvb284cGN4OXpkaWhkZHJ6bn"

"97104398-d13a-4ff6-a2f3-b30a05ad092b"
------WebKitFormBoundaryywIrc07RdSzlJJEt--
```

As you may see, the route and the the parameter names seem random - but they are not. vlserver obfuscates route names to prevent request guessing. Bonus side effect: We don't need to set a route name for every single route.

The names are sha512 hashes. They change when you change parameter names, controller names, ...

Using multipart/form data allows us to send `Blob`/`Buffer` (whole files) without converting them to another format.