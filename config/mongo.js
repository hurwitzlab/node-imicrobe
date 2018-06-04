'use strict';

var Promise = require('promise');
var MongoClient = require('mongodb').MongoClient;

// Load config file
var config = require('../config.json');

// Initialize MongoDB connection
function mongo() {
    return new Promise(function (resolve, reject) {
        MongoClient.connect(config.mongo.url, (err, db) => {
          if (err)
            reject(err)
          else
            resolve(db)
        });
    });
}

function decrementSampleKeys(sampleId) {
    console.log("Removing all sampleKey entries for sample", sampleId);

    return mongo()
        .then( db =>
            getSample(db, sampleId)
            .then( sample => {
                if (!sample || Object.keys(sample).length == 0)
                    return;

                return Promise.all(
                    Object.keys(sample)
                    .filter(key => key.startsWith("specimen__"))
                    .map(key => {
                        return decrementSampleKey(db, key, sample[key])
                    })
                )
            })
        );
}

function decrementSampleKey(db, key, value) {
    console.log("Removing sampleKey entry", key, value);

    return new Promise(function (resolve, reject) {
        db.collection('sampleKeys').findOne(
            { "_id": { "key": key } },
            (err, item) => {
                if (err)
                    reject(err);

                if (item) {
                    db.collection('sampleKeys').updateOne(
                        {
                            "_id" : {
                                "key" : key
                            }
                        },
                        {
                            "value" : {
                                "types" : {
                                    "Number" : ( isNaN(value) && item.value.types.Number > 0 ? item.value.types.Number : item.value.types.Number - 1 ),
                                    "String" : ( isNaN(value) && item.value.types.String > 0 ? item.value.types.String - 1 : item.value.types.String )
                                }
                            },
                            "totalOccurrences" : item.totalOccurrences > 0 ? item.totalOccurrences - 1 : item.totalOccurrences,
                            "percentContaining" : 100 // FIXME this is wrong (but unused so no impact)
                        },
                        (err, item) => {
                            if (err)
                                reject(err);
                        }
                    );

                    resolve();
                }
            }
        );
    });
}

function incrementSampleKey(db, key, value) {
    return new Promise(function (resolve, reject) {
        db.collection('sampleKeys').findOne(
            { "_id": { "key": key } },
            (err, item) => {
                if (err)
                    reject(err);

                if (item) {
                    db.collection('sampleKeys').updateOne(
                        {
                            "_id" : {
                                "key" : key
                            },
                        },
                        {
                            "value" : {
                                "types" : {
                                    "Number" : ( isNaN(value) ? item.value.types.Number : item.value.types.Number + 1 ),
                                    "String" : ( isNaN(value) ? item.value.types.String + 1 : item.value.types.String )
                                }
                            },
                            "totalOccurrences" : item.totalOccurrences + 1,
                            "percentContaining" : 100 // FIXME this is wrong (but unused so no impact)
                        },
                        (err, item) => {
                            if (err)
                                reject(err);
                        }
                    );
                }
                else {
                    db.collection('sampleKeys').insert(
                        {
                            "_id" : {
                                "key" : key
                            },
                            "value" : {
                                "types" : {
                                    "Number" : ( isNaN(value) ? 0 : 1 ),
                                    "String" : ( isNaN(value) ? 1 : 0 )
                                }
                            },
                            "totalOccurrences" : 1,
                            "percentContaining" : 100 // FIXME this is wrong (but unused so no impact)
                        },
                        (err, item) => {
                            if (err)
                                reject(err);
                        }
                    );
                }

                resolve();
            }
        );
    });
}

function getSample(db, sampleId) {
    return new Promise(function (resolve, reject) {
        db.collection('sample').findOne(
            { "specimen__sample_id": sampleId*1 }, // ensure integer value
            (err, item) => {
                if (err)
                    reject(err);
                resolve(item);
            }
        );
    });
}

module.exports.mongo = mongo;
module.exports.decrementSampleKeys = decrementSampleKeys;
module.exports.decrementSampleKey = decrementSampleKey;
module.exports.incrementSampleKey = incrementSampleKey;