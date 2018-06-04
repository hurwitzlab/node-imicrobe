
// Create error types
class MyError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}

const ERR_BAD_REQUEST = new MyError("Bad request", 400);
const ERR_UNAUTHORIZED = new MyError("Unauthorized", 401);
const ERR_PERMISSION_DENIED = new MyError("Permission denied", 403);
const ERR_NOT_FOUND = new MyError("Not found", 404);

module.exports.MyError = MyError;
module.exports.ERR_BAD_REQUEST = ERR_BAD_REQUEST;
module.exports.ERR_UNAUTHORIZED = ERR_UNAUTHORIZED;
module.exports.ERR_PERMISSION_DENIED = ERR_PERMISSION_DENIED;
module.exports.ERR_NOT_FOUND = ERR_NOT_FOUND;