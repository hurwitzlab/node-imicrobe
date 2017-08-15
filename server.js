'use strict';

var assert      = require('assert');
var cluster     = require('cluster');
var express = require('express');

// Load config file
var config = require('./config.json');

// Spawn workers and start server
var workers = process.env.WORKERS || require('os').cpus().length;
var app = express();
require('./api/routes.js')(app);

if (cluster.isMaster) {
    console.log('Start cluster with %s workers', workers);

    for (var i = 0; i < workers; ++i) {
        var worker = cluster.fork().process;
        console.log('Worker %s started.', worker.pid);
    }

    cluster.on('online', function(worker) {
        console.log('Worker ' + worker.process.pid + ' is online');
    });

    cluster.on('exit', function(worker) {
        console.log('Worker %s died. restarting...', worker.process.pid);
        cluster.fork();
    });

}
else {
    var server = app.listen(config.serverPort, function() {
        console.log('Process ' + process.pid + ' is listening to all incoming requests on port ' + config.serverPort);
    });
}

// Global uncaught exception handler
process.on('uncaughtException', function (err) {
    console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
    console.error(err.stack)
    process.exit(1)
})