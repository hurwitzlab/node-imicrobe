'use strict';

const printf      = require('printf');
const cors        = require('cors');
const Promise     = require('promise');
const bodyParser  = require('body-parser');
const sendmail    = require('sendmail')();
const https       = require("https");
const requestp    = require('request-promise');
//const querystring = require('querystring');
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
                    title: "Setting orcid " + orcid,
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
            title: "Send support email",
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

    app.get('/search/:query', function (req, res, next) {
        getSearchResults(req.params.query)
        .then( data => res.json(data) );
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
    req.auth = {
        profile: {},
        user: {}
    };

    validateAgaveToken(req, false)
    .then( profile => {
        req.auth.validToken = true;
        req.auth.profile = profile;
        if (profile) {
            return models.user.findOne({
                where: {
                    user_name: profile.username
                }
            })
            .then( user => {
                user.dataValues.first_name = profile.first_name;
                user.dataValues.last_name = profile.last_name;
                return user;
            });
        }

        return null;
    })
    .then( user => {
        if (user)
            req.auth.user = user;
    })
    .finally(next);
}

function validateAgaveToken(req, isTokenRequired) {
    isTokenRequired = typeof isTokenRequired === 'undefined' ? true : isTokenRequired;

    return new Promise((resolve, reject) => {
        var token;
        if (req && req.headers)
            token = req.headers.authorization;

        if (!token) {
            if (isTokenRequired) {
                console.log('Error: Authorization token missing: headers = ', req.headers);
                reject(new Error('Authorization token missing'));
            }
            else {
                resolve();
            }
        }
        console.log("validateAgaveToken: token:", token);

        const profilereq = https.request(
            {   method: 'GET',
                host: 'agave.iplantc.org',
                port: 443,
                path: '/profiles/v2/me',
                headers: {
                    Authorization: token
                }
            },
            res => {
                res.setEncoding("utf8");
                if (res.statusCode < 200 || res.statusCode > 299) {
                    console.log("validateAgaveToken: !!!!!!! failed to get profile: ", res.statusCode);
                    reject(new Error('Failed to load page, status code: ' + res.statusCode));
                }

                var body = [];
                res.on('data', (chunk) => body.push(chunk));
                res.on('end', () => {
                    body = body.join('');
                    var data = JSON.parse(body);
                    if (!data || data.status != "success")
                        reject(new Error('Status ' + data.status));
                    else {
                        console.log("validateAgaveToken: *** success ***");
                        data.result.token = token;
                        resolve(data.result);
                    }
                });
            }
        );
        profilereq.on('error', (err) => reject(err));
        profilereq.end();
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
