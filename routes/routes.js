'use strict';

const printf      = require('printf');
const cors        = require('cors');
const Promise     = require('promise');
const bodyParser  = require('body-parser');
const sendmail    = require('sendmail')();
const requestp    = require('request-promise');
const https       = require('https');
const pathlib     = require('path');
const sequelize   = require('../config/mysql').sequelize;
const models      = require('../models/index');

const errors = require('./errors');
const toJsonOrError = require('./utils').toJsonOrError;
const requireAuth = require('./utils').requireAuth;
const errorOnNull = require('./utils').errorOnNull;
const logAdd = require('./utils').logAdd;
const permissions = require('./permissions')(sequelize);

const apps           = require('./apps');
const assemblies     = require('./assemblies');
const domains        = require('./domains');
const investigators  = require('./investigators');
const project_groups = require('./project_groups');
const projects       = require('./projects');
const publications   = require('./publications');
const sample_groups  = require('./sample_groups');
const samples        = require('./samples');
const users          = require('./users');

// Load config file
const config = require('../config.json');


//TODO split up into modules
module.exports = function(app) {
    app.use(cors());
    app.use(bodyParser.json()); // support json encoded bodies
    app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
    app.use(requestLogger);
    app.use(agaveTokenValidator);

    app.use(apps);
    app.use(assemblies);
    app.use(domains);
    app.use(investigators);
    app.use(project_groups);
    app.use(projects);
    app.use(publications);
    app.use(sample_groups);
    app.use(samples);
    app.use(users);

    app.post('/authenticate', function(req, res, next) { // three-legged oauth
        console.log(req.body);

        var provider_name = req.body.provider;
        var code = req.body.code;
        var user_id = req.body.user_id;
        var redirect_uri = req.body.redirect_uri;

        var oauthConfig = config.oauthClients["orcid"];

        var options = {
            method: "POST",
            uri: oauthConfig.tokenUrl,
            headers: { Accept: "application/json" },
            form: {
                client_id: oauthConfig.clientID,
                client_secret: oauthConfig.clientSecret,
                grant_type: "authorization_code",
                redirect_uri: redirect_uri,
                code: code
            },
            json: true
        };

        requestp(options)
        .then(function (parsedBody) {
            console.log(parsedBody);

            models.user.update(
                { orcid: parsedBody.orcid },
                { returning: true, where: { user_id: user_id } }
            )
            .then( () =>
                logAdd(req, {
                    title: "Updated orcid " + orcid,
                    type: "setOrcid",
                    orcid: orcid
                })
            )
            .then( () => {
                res.json(parsedBody);
            })
            .catch((err) => {
                console.error("Error: ", err);
                res.status(500).send(err);
            });
        })
        .catch(function (err) {
            console.error(err.message);
            res.status(401).send("Authentication failed");
        });
    });

    app.post('/contact', function(req, res, next) {
        console.log(req.body);

        var name = req.body.name || "Unknown";
        var email = req.body.email || "Unknown";
        var message = req.body.message || "";

        logAdd(req, {
            title: "Sent support email",
            type: "contact"
        })
        .then( () => {
            sendmail({
                from: email,
                to: config.supportEmail,
                subject: 'Support request',
                html: message,
            }, (err, reply) => {
                console.log(err && err.stack);
                console.dir(reply);
            });

            res.json({
                status: "success"
            });
        })
    });

    app.get('/download/:filepath(\\S+)', function(req, res, next) {
        // Can be done wit res.download(filename) but we want to send content directly
        res.setHeader('Content-disposition', 'attachment;filename=' + pathlib.basename(req.params.filepath));
        res.setHeader('Content-type', 'application/octet-stream');

        var options = {
            host: config.agaveBaseUrl.replace(/^https?:\/\//,''), // remove protocol
            path: "/files/v2/media/" + req.params.filepath,
            headers: {
                Accept: "application/octet-stream",
                Authorization: req.query.token
            }
        }

        // Request file from Agave and stream response to client
        try {
            https.get(options,
                function(response) {
                    // Stream to client
                    response.on('data', function(data) {
                        res.write(data);
                    });
                    // Handle end of transaction
                    response.on('end', function() {
                        res.end();
                    });
                });
        }
        catch(error) {
            console.log(error);
            res.send(500, error)
        }
    });

    app.get('/search/:query', function (req, res, next) {
        getSearchResults(req.params.query)
        .then( results => {
            return models.query_log.create({
                num_found: results.length,
                query: req.params.query,
                ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                user_id: req.auth.user ? req.auth.user.user_id+"" : null
            })
            .then( () => results )
        })
        .then( results => res.json(results) );
    });

    app.get('/', function(req, res, next) {
        var routes = app._router.stack        // registered routes
                     .filter(r => r.route)    // take out all the middleware
                     .map(r => r.route.path);
        res.json({ "routes": routes });
    });

    app.use(errorHandler);

    // Catch-all function
    app.get('*', function(req, res, next){
        res.status(404).send("Unknown route: " + req.path);
    });
};

function requestLogger(req, res, next) {
    console.log(["REQUEST:", req.method, req.url].join(" ").concat(" ").padEnd(80, "-"));
    next();
}

function errorHandler(error, req, res, next) {
    console.log("ERROR ".padEnd(80, "!"));
    console.log(error.stack);

    let statusCode = error.statusCode || 500;
    let message = error.message || "Unknown error";

    res.status(statusCode).send(message);
}

function agaveTokenValidator(req, res, next) {
    var token;
    if (req && req.headers)
        token = req.headers.authorization;
    console.log("validateAgaveToken: token:", token);

    req.auth = {
        validToken: false
    };

    if (!token)
        next();
    else {
        getAgaveProfile(token)
        .then(function (response) {
            if (!response || response.status != "success") {
                console.log('validateAgaveToken: !!!! Bad profile status: ' + response.status);
                return;
            }
            else {
                response.result.token = token;
                return response.result;
            }
        })
        .then( profile => {
            if (profile) {
                console.log("validateAgaveToken: *** success ***  username:", profile.username);

                req.auth = {
                    validToken: true,
                    profile: profile
                };

                return models.user.findOrCreate({
                    where: {
                        user_name: profile.username
                    }
                })
                .spread( (user, created) => {
                    user.dataValues.first_name = profile.first_name;
                    user.dataValues.last_name = profile.last_name;
                    user.dataValues.email = profile.email
                    return user;
                });
            }

            return;
        })
        .then( user => {
            if (user)
                req.auth.user = user;
        })
        .catch( error => {
            console.log("validateAgaveToken: !!!!", error.message);
        })
        .finally(next);
    }
}

function getAgaveProfile(token) {
    return requestp({
        method: "GET",
        uri: "https://agave.iplantc.org/profiles/v2/me", // FIXME hardcoded
        headers: {
            Authorization: token,
            Accept: "application/json"
        },
        json: true
    });
}

function getSearchResults(query) {
  return new Promise(function (resolve, reject) {
    sequelize.query(
      printf(
        `
        select table_name, primary_key as id, object_name
        from   search
        where  match (search_text) against (%s in boolean mode)
        `,
        sequelize.getQueryInterface().escape(query)
      ),
      { type: sequelize.QueryTypes.SELECT }
    )
    .then(results => resolve(results));
  });
}
