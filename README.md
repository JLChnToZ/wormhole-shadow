# Wormhole Shadow

This is an utility library for JavaScript that could be used to transparently communicate between execution environment.
This utility wraps the objects in the other connected execution envirnments with proxy (aka. shadowed objects).
These shadowed objects can be manuipated as local objects
(supported operations such as access a property, assign new values, even call/construct like a function),
until you need to get the actual value, you will have to await the shadow object with async/promise for cloning the value from the remote world.
The interfaces are bidirectional, when you try to pass an object to the remote (via assigning/put in function argument),
it creates a shadowed object in the remote world too.
But to enforce to clone the actual object to remote, you can use `solid()` to create "solid" objects which will be cloned.

In this module, it includes an abstract implementation for interact with your own connection interface and a full implementation for Node.JS worker threads.

## License

[MIT](LICENSE)