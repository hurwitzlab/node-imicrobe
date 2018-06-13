const mongo = require('../config/mongo').mongo;
const errors = require('./errors');


const EMPTY_PROMISE = new Promise((resolve) => { resolve(); });

function toJsonOrError(res, next, promise) {
    promise
    .then(result => {
        if (!result)
            throw(new errors.MyError("Not found", 404));
        else {
            res.json(result);
            console.log("RESPONSE ".padEnd(80, "-"));
        }
    })
    .catch(next);
}

function errorOnNull() {
    if (arguments) {
        var notNull = Object.values(arguments).every( x => { return (typeof x !== "undefined") } );
        if (!notNull)
            throw(errors.ERR_BAD_REQUEST);
    }
}

function requireAuth(req) {
    if (!req || !req.auth || !req.auth.validToken || !req.auth.user)
        throw(errors.ERR_UNAUTHORIZED);
}

function logAdd(req, entry) {
    if (!entry || !entry.type || !entry.title)
        throw("Invalid log entry");

    console.log("Log: ", entry.title);

    if (req) {
        entry.url = req.originalUrl;
        if (req.auth && req.auth.user) {
            if (req.auth.user.user_name)
                entry.user_name = req.auth.user.user_name;
            if (req.auth.user.user_id)
                entry.user_id = req.auth.user.user_id;
        }
    }

    entry.date = new Date();

    return mongo()
        .then( db =>
            db.collection('log').insert(entry)
        );
}

module.exports.EMPTY_PROMISE = EMPTY_PROMISE;
module.exports.toJsonOrError = toJsonOrError;
module.exports.errorOnNull = errorOnNull;
module.exports.requireAuth = requireAuth;
module.exports.logAdd = logAdd;