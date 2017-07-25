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

module.exports.mongo = mongo;