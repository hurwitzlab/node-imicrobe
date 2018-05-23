'use strict';

const printf      = require('printf');
const cors        = require('cors');
const Promise     = require('promise');
const bodyParser  = require('body-parser');
const jsonParser  = bodyParser.json();
const sendmail    = require('sendmail')();
const https       = require("https");
const requestp    = require('request-promise');
const querystring = require('querystring');
const mongo       = require('../config/mongo').mongo;
const sequelize   = require('../config/mysql').sequelize;
const models      = require('./models/index');

// Load config file
const config = require('../config.json');

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


// Reusable sub-queries

const PROJECT_PERMISSION_ATTR = // Convert "permission" field to a string
    [ sequelize.literal(
        '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
            'FROM project_to_user WHERE project_to_user.user_id = users.user_id AND project_to_user.project_id = project.project_id)'
      ),
      'permission'
    ]

const SAMPLE_PERMISSION_ATTR = // FIXME can this be combined with PROJECT_PERMISSION_ATTR?
    [ sequelize.literal(
        '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
            'FROM project_to_user WHERE project_to_user.user_id = `project->users`.`user_id` AND project_to_user.project_id = project.project_id)'
      ),
      'permission'
    ]

const PROJECT_GROUP_PERMISSION_ATTR = // FIXME can this be combined with PROJECT_PERMISSION_ATTR?
    [ sequelize.literal(
        '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
            'FROM project_group_to_user WHERE project_group_to_user.user_id = `project->project_groups->users`.`user_id` AND project_group_to_user.project_group_id = project_group_id)'
      ),
      'permission'
    ]

const PROJECT_GROUP_PERMISSION_ATTR2 = // FIXME can this be combined with PROJECT_PERMISSION_ATTR?
    [ sequelize.literal(
        '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
            'FROM project_group_to_user WHERE project_group_to_user.user_id = `project_groups->users`.`user_id` AND project_group_to_user.project_group_id = project_group_id)'
      ),
      'permission'
    ]

const PROJECT_GROUP_PERMISSION_ATTR3 = // FIXME can this be combined with PROJECT_PERMISSION_ATTR?
    [ sequelize.literal(
        '(SELECT CASE WHEN permission=1 THEN "owner" WHEN permission=2 THEN "read-write" WHEN permission=3 THEN "read-only" WHEN permission IS NULL THEN "read-only" END ' +
            'FROM project_group_to_user WHERE project_group_to_user.user_id = users.user_id AND project_group_to_user.project_group_id = project_group_id)'
      ),
      'permission'
    ]

function PROJECT_PERMISSION_CLAUSE(user) {
    return {
        $or: [
            { private: { $or: [0, null] } },
            (user && user.user_name ? sequelize.literal("users.user_name = '" + user.user_name + "'") : {}),
            //(user && user.user_name ? sequelize.literal("`project_groups->users`.`user_id` = '" + user.user_id + "'") : {}) // not working
        ]
    };
}

// Permission codes -- in order of decreasing access rights
const PERMISSION_OWNER = 1;
const PERMISSION_READ_WRITE = 2;
const PERMISSION_READ_ONLY = 3;
const PERMISSION_NONE = 4;

const PERMISSION_CODES = {
    "owner": PERMISSION_OWNER,
    "read-write": PERMISSION_READ_WRITE,
    "read-only": PERMISSION_READ_ONLY,
    "none": PERMISSION_NONE
}

const AGAVE_PERMISSION_CODES = {
    "READ_WRITE": PERMISSION_READ_WRITE,
    "READ": PERMISSION_READ_ONLY,
    "NONE": PERMISSION_NONE
}

function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}


//TODO split up into modules
module.exports = function(app) {
    app.use(cors());
    app.use(bodyParser.json()); // support json encoded bodies
    app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
    app.use(requestLogger);
    app.use(agaveTokenValidator);

    app.get('/apps', function(req, res, next) {
        toJsonOrError(res, next,
            models.app.findAll({
                include: [
                    { model: models.app_tag
                    , through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.app_data_type
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        );
    });

    app.get('/apps/:id(\\d+)', function(req, res, next) {
        toJsonOrError(res, next,
            models.app.findOne({
                where: { app_id: req.params.id },
                include: [
                    { model: models.app_data_type,
                      through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.app_tag,
                      through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.app_result,
                      attributes: [ 'app_result_id', 'path' ],
                      include: [
                        { model: models.app_data_type }
                      ]
                    }
                ]
            })
        );
    });

    app.get('/apps/:name([\\w\\.\\-\\_]+)', function(req, res, next) {
        toJsonOrError(res, next,
            models.app.findOne({ // multiple results could be found, just return one of them
                where: { app_name: req.params.name },
                include: [
                    { model: models.app_data_type,
                      through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.app_tag,
                      through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.app_result,
                      attributes: [ 'app_result_id', 'path' ],
                      include: [
                        { model: models.app_data_type }
                      ]
                    }
                ]
            })
        );
    });

    app.post('/apps/runs', function(req, res, next) {
        var app_id = req.body.app_id;
        var params = req.body.params;

        errorOnNull(app_id, params);

        requireAuth(req);

        toJsonOrError(res, next,
            models.app_run.create({
                app_id: app_id,
                user_id: req.auth.user.user_id,
                app_ran_at: sequelize.fn('NOW'),
                params: params
            })
            .then( () =>
                models.app.findOne({ where: { app_id: app_id } })
            )
            .then( app =>
                logAdd(req, {
                    title: "Run app " + app.app_name,
                    type: "runApp",
                    app_id: app_id,
                    app_name: app.app_name
                })
            )
        );
    });

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

    app.get('/assemblies', function(req, res, next) {
        //TODO currently private samples cannot have assemblies, but in the future will need to check permissions on parent project
        toJsonOrError(res, next,
            models.assembly.findAll({
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    }
                ]
            })
        );
    });

    app.get('/assemblies/:id(\\d+)', function(req, res, next) {
        //TODO currently private samples cannot have assemblies, but in the future will need to check permissions on parent project
        toJsonOrError(res, next,
            models.assembly.findOne({
                where: { assembly_id: req.params.id },
                include: [
                    { model: models.project
                    , attributes : [ 'project_id', 'project_name' ]
                    }
                ]
            })
        );
    });

    app.get('/combined_assemblies', function(req, res, next) {
        //TODO currently private samples cannot have combined_assemblies, but in the future will need to check permissions on parent project
        toJsonOrError(res, next,
            models.combined_assembly.findAll({
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    },
                    { model: models.sample
                    , attributes: [ 'sample_id', 'sample_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        );
    });

    app.get('/combined_assemblies/:id(\\d+)', function(req, res, next) {
        //TODO currently private samples cannot have combined_assemblies, but in the future will need to check permissions on parent project
        toJsonOrError(res, next,
            models.combined_assembly.findOne({
                where: { combined_assembly_id: req.params.id },
                include: [
                    { model: models.project
                    , attributes : [ 'project_id', 'project_name' ]
                    },
                    { model: models.sample
                    , attributes: [ 'sample_id', 'sample_name' ]
                    }
                ]
            })
        );
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

    app.get('/domains', function(req, res, next) {
        toJsonOrError(res, next,
            models.domain.findAll({
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        );
    });

    app.get('/domains/:id(\\d+)', function(req, res, next) {
        toJsonOrError(res, next,
            models.domain.findOne({
                where: { domain_id: req.params.id },
                include: [
                    { model: models.project
                    , attributes : [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        );
    });

    app.get('/investigators/:id(\\d+)', function(req, res, next) {
        toJsonOrError(res, next,
            models.investigator.findOne({
                where: { investigator_id: req.params.id },
                include: [
                    { model: models.project
                    , through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.sample
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        );
    });

    app.get('/investigators/:name(\\w+)', function(req, res, next) {
        toJsonOrError(res, next,
            models.investigator.findAll({
                where: { investigator_name: { $like: "%"+req.params.name+"%" } }
            })
        );
    });

    app.get('/investigators', function(req, res, next) {
        toJsonOrError(res, next,
            models.investigator.findAll()
        );
    });

    app.put('/investigators', function(req, res, next) {
        var name = req.body.name;
        var institution = req.body.institution;

        errorOnNull(name, institution);

        requireAuth(req);

        toJsonOrError(res, next,
            models.investigator.create({
                name: name,
                institution: institution,
                url: req.body.url
            })
            .then( () =>
                logAdd(req, {
                    title: "Add investigator " + name,
                    type: "addInvestigator",
                    name: name,
                    institution: institution
                })
            )
        );
    });

    app.get('/project_groups', function(req, res, next) {
        toJsonOrError(res, next,
            models.project_group.findAll({
                where: (req.query.term ? { group_name: { $like: "%"+req.query.term+"%" } } : {}),
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.user
                    , attributes: [ 'user_id', 'user_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        );
    })

    app.get('/project_groups/:id(\\d+)', function(req, res, next) {
        toJsonOrError(res, next,
            models.project_group.findOne({
                where: { project_group_id: req.params.id },
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        );
    });

    // Add a Project to a Project Group (and share with the group's user list)
    app.put('/project_groups/:project_group_id(\\d+)/projects/:project_id(\\d+)', function(req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            requireProjectEditPermission(req.params.project_id, req.auth.user)
            .then( () =>
                models.project_to_project_group.findOrCreate({
                    where: {
                        project_group_id: req.params.project_group_id,
                        project_id: req.params.project_id
                    }
                })
            )
            // Get project and group for logging
            .then( () =>
                Promise.all([
                    models.project.findOne({
                        where: { project_id: req.params.project_id }
                    }),
                    models.project_group.findOne({
                        where: { project_group_id: req.params.project_group_id }
                    })
                ])
            )
            .then( results =>
                logAdd(req, {
                    title: "Add project '" + results[0].project_name + "' to group '" + results[1].group_name + "'",
                    type: "addProjectToProjectGroup",
                    project_id: req.params.project_id,
                    project_group_id: req.params.project_group_id
                })
            )
            .then( () =>
                models.project_group.findOne({
                    where: { project_group_id: req.params.project_group_id },
                    include: [
                        { model: models.user
                        , attributes: [ 'user_id', 'user_name', PROJECT_GROUP_PERMISSION_ATTR3 ]
                        , through: { attributes: [] } // remove connector table from output
                        }
                    ]
                })
            )
            .then( project_group =>
                Promise.all(
                    project_group.users
                    .map( user => {
                        return updateProjectFilePermissions(req.params.project_id, user.user_id, req.headers.authorization, user.get().permission)
                    })
                )
            )
            .then( () =>
                models.project.findOne({
                    where: { project_id: req.params.project_id },
                    include: [
                        { model: models.project_group
                        , attributes: [ 'project_group_id', 'group_name',
                            [ sequelize.literal('(SELECT COUNT(*) FROM project_group_to_user WHERE project_group_to_user.project_group_id = project_group_id)'), 'user_count' ]
                          ]
                        , through: { attributes: [] } // remove connector table from output
                        }
                    ]
                })
            )
            .then( project =>
                project.project_groups
            )
        );
    });

    // Remove a Project from a Project Group (and unshare with the group's user list)
    app.delete('/project_groups/:project_group_id(\\d+)/projects/:project_id(\\d+)', function(req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            requireProjectEditPermission(req.params.project_id, req.auth.user)
            // Get project and group for logging
            .then( () =>
                Promise.all([
                    models.project.findOne({
                        where: { project_id: req.params.project_id }
                    }),
                    models.project_group.findOne({
                        where: { project_group_id: req.params.project_group_id }
                    })
                ])
            )
            .then( results =>
                logAdd(req, {
                    title: "Remove project '" + results[0].project_name + "' from group '" + results[1].group_name + "'",
                    type: "removeProjectFromProjectGroup",
                    project_id: req.params.project_id,
                    project_group_id: req.params.project_group_id
                })
            )
            .then( () =>
                models.project_to_project_group.destroy({
                    where: {
                        project_group_id: req.params.project_group_id,
                        project_id: req.params.project_id
                    }
                })
            )
            .then( () => {
                return "success";
            })
        );
    });

    app.get('/projects/:id(\\d+)', function(req, res, next) {
        toJsonOrError(res, next,
            checkProjectPermissions(req.params.id, req.auth.user)
            .then( () => {
                return Promise.all([
                    models.project.findOne({
                        where: {
                            project_id: req.params.id
                        },
                        include: [
                            { model: models.investigator
                            , attributes: [ 'investigator_id', 'investigator_name' ]
                            , through: { attributes: [] } // remove connector table from output
                            },
                            { model: models.domain
                            , attributes: [ 'domain_id', 'domain_name' ]
                            , through: { attributes: [] } // remove connector table from output
                            },
                            { model: models.publication
                            , attributes: ['publication_id', 'title', 'author' ]
                            },
                            { model: models.sample
                            , attributes: ['sample_id', 'sample_name', 'sample_type' ]
                            , include: [
                                { model: models.sample_file
                                }
                              ]
                            },
                            { model: models.project_group
                            , attributes: [ 'project_group_id', 'group_name',
                                [ sequelize.literal('(SELECT COUNT(*) FROM project_group_to_user WHERE project_group_to_user.project_group_id = project_group_id)'), 'user_count' ]
                              ]
                            , through: { attributes: [] } // remove connector table from output
                            },
                            { model: models.user
                            , attributes: [ 'user_id', 'user_name', 'first_name', 'last_name', PROJECT_PERMISSION_ATTR ]
                            , through: { attributes: [] } // remove connector table from output
                            }
                        ]
                    }),

                    models.project.aggregate('project_type', 'DISTINCT', { plain: false }),

                    models.domain.findAll({
                        attributes: [ 'domain_id', 'domain_name' ]
                    }),

                    models.project_group.findAll({
                        attributes: [ 'project_group_id', 'group_name' ]
                    }),

                    models.assembly.count({
                        where: { project_id: req.params.id },
                    }),

                    models.combined_assembly.count({
                        where: { project_id: req.params.id },
                    })
                ])
            })
            .then( results => {
                var project = results[0];
                if (!project)
                    throw(ERR_NOT_FOUND);

                project.dataValues.available_types = results[1].map( obj => obj.DISTINCT).filter(s => (typeof s != "undefined" && s)).sort();
                project.dataValues.available_domains = results[2];
                project.dataValues.available_groups = results[3];
                project.dataValues.assembly_count = results[4];
                project.dataValues.combined_assembly_count = results[5];
                return project;
            })
        );
    });

    app.get('/projects', function(req, res, next) {
        toJsonOrError(res, next,
            models.project.findAll({
                //where: PROJECT_PERMISSION_CLAUSE(req.auth.user), // replaced by manual filter below to get project_group access working
                include: [
                    { model: models.investigator
                    , attributes: ['investigator_id', 'investigator_name']
                    , through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.domain
                    , attributes: ['domain_id', 'domain_name']
                    , through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.publication
                    , attributes: ['publication_id', 'title']
                    },
                    { model: models.user
                    , attributes: ['user_id', 'user_name', 'first_name', 'last_name', PROJECT_PERMISSION_ATTR ]
                    , through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.project_group
                    , attributes: ['project_group_id', 'group_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    , include: [
                        { model: models.user
                        , attributes: ['user_id', 'user_name', 'first_name', 'last_name', PROJECT_GROUP_PERMISSION_ATTR2 ]
                        , through: { attributes: [] } // remove connector table from output
                        }
                      ]
                    }
                ],
                attributes: {
                    include: [[ sequelize.literal('(SELECT COUNT(*) FROM sample WHERE sample.project_id = project.project_id)'), 'sample_count' ]]
                }
            })
            .then( projects => { // filter on permission
                return projects.filter(project => {
                    var hasUserAccess = project.users.map(u => u.user_name).includes(req.auth.user.user_name);
                    var hasGroupAccess = project.project_groups.reduce((acc, g) => acc.concat(g.users), []).map(u => u.user_name).includes(req.auth.user.user_name);
                    return !project.private
                        || (req.auth.user && req.auth.user.user_name
                            && (hasUserAccess || hasGroupAccess));
                })
            })
        );
    });

    app.get('/projects/:id(\\d+)/assemblies', function (req, res, next) {
        //TODO currently private samples cannot have assemblies, but in the future will need to check permissions on parent project
        toJsonOrError(res, next,
            models.assembly.findAll({
                where: { project_id: req.params.id },
                attributes: [ 'assembly_id', 'assembly_name' ]
            })
        );
    });

    app.get('/projects/:id(\\d+)/combined_assemblies', function (req, res, next) {
        //TODO currently private samples cannot have combined_assemblies, but in the future will need to check permissions on parent project
        toJsonOrError(res, next,
            models.combined_assembly.findAll({
                where: { project_id: req.params.id },
                attributes: [ 'combined_assembly_id', 'assembly_name' ]
            })
        );
    });

    app.put('/projects', function(req, res, next) {
        var project_name = req.body.project_name;

        errorOnNull(project_name);

        requireAuth(req);

        toJsonOrError(res, next,
            models.project.create({
                project_name: project_name,
                project_code: "",
                pi: "",
                institution: "",
                project_type: "<not provided>",
                url: "",
                read_file: "",
                meta_file: "",
                assembly_file: "",
                peptide_file: "",
                email: "",
                read_pep_file: "",
                nt_file: "",
                private: 1,
                project_to_users: [
                    { user_id: req.auth.user.user_id,
                      permission: 1 //FIXME hardcoded
                    }
                ]
            },
            { include: [ models.project_to_user ]
            })
            .then( project =>
                logAdd(req, {
                    title: "Add project '" + project_name + "'",
                    type: "addProject",
                    project_id: project.get().project_id
                })
                .then( () => project )
            )
        );
    });

    app.post('/projects/:project_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        var project_id = req.params.project_id;
        var project_name = req.body.project_name;
        var project_code = req.body.project_code;
        var project_type = req.body.project_type;
        var project_url = req.body.project_url;
        var domains = req.body.domains;
        var investigators = req.body.investigators;
        var groups = req.body.groups;

        toJsonOrError(res, next,
            requireProjectEditPermission(project_id, req.auth.user)
            .then( () =>
                logAdd(req, {
                    title: "Update project '" + project_name + "'",
                    type: "updateProject",
                    project_id: project_id
                })
            )
            .then( () =>
                models.project.update(
                    { project_name: project_name,
                      project_code: project_code,
                      project_type: project_type,
                      url: project_url
                    },
                    { where: { project_id: project_id } }
                )
            )
            .then( () => // remove all domains from project
                models.project_to_domain.destroy({
                    where: { project_id: project_id }
                })
            )
            .then( () =>
                Promise.all(
                    domains.map( d =>
                        models.project_to_domain.findOrCreate({
                            where: {
                                project_id: project_id,
                                domain_id: d.domain_id
                            }
                        })
                    )
                )
            )
            .then( () => // remove all investigators from project
                models.project_to_investigator.destroy({
                    where: { project_id: project_id }
                })
            )
            .then( () =>
                Promise.all(
                    investigators.map( i =>
                        models.project_to_investigator.findOrCreate({
                            where: {
                                project_id: project_id,
                                investigator_id: i.investigator_id
                            }
                        })
                    )
                )
            )
            .then( () =>
                models.project.findOne({
                    where: { project_id: project_id },
                    include: [
                        { model: models.project_group },
                        { model: models.domain },
                        { model: models.investigator }
                    ]
                })
            )
        );
    });

    app.delete('/projects/:project_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            requireProjectEditPermission(req.params.project_id, req.auth.user)
            .then( () =>
                models.project.findOne({
                    where: { project_id: req.params.project_id },
                    include: [
                        { model: models.sample },
                    ]
                })
            )
            .then( project =>
                logAdd(req, {
                    title: "Remove project '" + project.project_name + "'",
                    type: "removeProject",
                    project_id: project.project_id
                })
                .then( () => project )
            )
            .then( project => {
                return Promise.all(
                    project.samples.map( sample =>
                        decrementSampleKeys(sample.sample_id)
                    )
                )
            })
            .then( () =>
                models.publication.destroy({ // FIXME add on cascade delete
                    where: {
                        project_id: req.params.project_id
                    }
                })
            )
            .then( () =>
                models.project.destroy({
                    where: {
                        project_id: req.params.project_id
                    }
                })
            )
        );
    });

    app.put('/projects/:project_id(\\d+)/investigators/:investigator_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            requireProjectEditPermission(req.params.project_id, req.auth.user)
            // Get project and investigator for logging
            .then( () =>
                Promise.all([
                    models.project.findOne({
                        where: { project_id: req.params.project_id }
                    }),
                    models.investigator.findOne({
                        where: { investigator_id: req.params.investigator_id }
                    })
                ])
            )
            .then( results =>
                logAdd(req, {
                    title: "Add investigator " + results[1].investigator_name + " to project '" + results[0].project_name + "'",
                    type: "addInvestigatorToProject",
                    project_id: req.params.project_id,
                    investigator_id: req.params.investigator_id
                })
            )
            .then( () =>
                models.project_to_investigator.findOrCreate({
                    where: {
                        project_id: req.params.project_id,
                        investigator_id: req.params.investigator_id
                    }
                })
            )
            .then( () =>
                models.project.findOne({
                    where: { project_id: req.params.project_id },
                    include: [
                        { model: models.investigator },
                    ]
                })
            )
        );
    });

    app.delete('/projects/:project_id(\\d+)/investigators/:investigator_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            requireProjectEditPermission(req.params.project_id, req.auth.user)
            // Get project and investigator for logging
            .then( () =>
                Promise.all([
                    models.project.findOne({
                        where: { project_id: req.params.project_id }
                    }),
                    models.investigator.findOne({
                        where: { investigator_id: req.params.investigator_id }
                    })
                ])
            )
            .then( results =>
                logAdd(req, {
                    title: "Remove investigator " + results[1].investigator_name + " from project '" + results[0].project_name + "'",
                    type: "removeInvestigatorFromProject",
                    project_id: req.params.project_id,
                    investigator_id: req.params.investigator_id
                })
            )
            .then( () =>
                models.project_to_investigator.destroy({
                    where: {
                        project_id: req.params.project_id,
                        investigator_id: req.params.investigator_id
                    }
                })
            )
        );
    });

    app.put('/projects/:project_id(\\d+)/users/:user_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            requireProjectEditPermission(req.params.project_id, req.auth.user)
            // Get project and user for logging
            .then( () =>
                Promise.all([
                    models.project.findOne({
                        where: { project_id: req.params.project_id }
                    }),
                    models.user.findOne({
                        where: { user_id: req.params.user_id }
                    })
                ])
            )
            .then( results =>
                logAdd(req, {
                    title: "Add user " + (results[1].first_name + " " + results[1].last_name) + " (" + results[1].user_name + ") to project '" + results[0].project_name + "'",
                    type: "addUserToProject",
                    project_id: req.params.project_id,
                    target_user_id: req.params.user_id,
                    permission: req.body.permission
                })
            )
            .then( () =>
                models.project_to_user.destroy({ // First remove all existing connections
                    where: {
                        project_id: req.params.project_id,
                        user_id: req.params.user_id
                    }
                })
            )
            .then( () =>
                models.project_to_user.create({
                    project_id: req.params.project_id,
                    user_id: req.params.user_id,
                    permission: PERMISSION_CODES[req.body.permission]
                })
            )
            .then( updateProjectFilePermissions(req.params.project_id, req.params.user_id, req.headers.authorization, req.body.permission) )
            .then( () =>
                models.project.findOne({
                    where: { project_id: req.params.project_id },
                    include: [
                        { model: models.user
                        , attributes: ['user_id', 'user_name', 'first_name', 'last_name', PROJECT_PERMISSION_ATTR]
                        , through: { attributes: [] } // remove connector table from output
                        }
                    ]
                })
            )
        );
    });

    // Move into own module
    function updateProjectFilePermissions(project_id, user_id, token, permission, files) {
        console.log("updateProjectFilePermissions", project_id, user_id, permission)
        return models.project.findOne({
            where: { project_id: project_id },
            include: [
                { model: models.sample,
                  include: [ models.sample_file ]
                }
            ]
        })
        .then( project => {
            return models.user.findOne({
                where: { user_id: user_id }
            })
            .then( user => {
                return {
                    user: user,
                    samples: project.samples
                }
            })
        })
        .then( result => {
            var username = result.user.user_name;

            if (!files) { // use all project's sample files if none given
                files = result.samples.reduce((acc, s) => acc.concat(s.sample_files), []);
                files = files.map(f => f.file);
            }

            var agavePermission = toAgavePermission(permission);

            return agaveUpdateFilePermissions(username, token, agavePermission, files);
        });
    }

    function updateSampleFilePermissions(sample_id, token, files) {
        return models.sample.findOne({
            where: { sample_id: sample_id },
            include: [
                { model: models.project
                , include: [
                        { model: models.user
                        , attributes: [ 'user_id', 'user_name', 'first_name', 'last_name' ]
                        , through: { attributes: [ 'permission' ] }
                        },
                        { model: models.project_group
                        , attributes: [ 'project_group_id', 'group_name' ]
                        , through: { attributes: [] } // remove connector table from output
                        , include: [
                            { model: models.user
                            , attributes: [ 'user_id', 'user_name' ]
                            , through: { attributes: [ 'permission' ] }
                            }
                          ]
                        }
                    ]
                },
                { model: models.sample_file
                }
            ]
        })
        .then( sample => {
            if (!files) // use all sample files if none given
                files = sample.sample_files.map(f => f.file);

            // Merge users from direct sharing and through groups, preventing duplicates
            var users = sample.project.users;
            var seen = users.reduce((map, user) => { map[user.user_id] = 1; return map; }, {});
            var allUsers = sample.project.project_groups
                .reduce((acc, g) => acc.concat(g.users), [])
                .reduce((acc, u) => {
                    if (!seen[u.user_id])
                        acc.push(u);
                    return acc;
                }, []).concat(users);

            return Promise.all(
                allUsers.map(u => {
                    var permission = (u.project_to_user ? u.project_to_user.permission : u.project_group_to_user.permission);
                    var agavePermission = toAgavePermission(getKeyByValue(PERMISSION_CODES, permission));
                    return agaveUpdateFilePermissions(u.user_name, token, agavePermission, files);
                })
            );
        });
    }

    function agaveUpdateFilePermissions(username, token, permission, files) {
        return Promise.all(
            files.map(f => {
                return agaveGetFilePermissions(username, token, f)
                    .then( curPermission => {
                        if (AGAVE_PERMISSION_CODES[curPermission] <= AGAVE_PERMISSION_CODES[permission]) {
                            console.log("No change to permission: ", username, curPermission, permission, f)
                            return; // only change permission if it expands access (e.g. from READ to READ_WRITE)
                        }

                        var url = config.agaveBaseUrl + "/files/v2/pems/system/data.iplantcollaborative.org" + f;
                        var options = {
                            method: "POST",
                            uri: url,
                            headers: {
                                Accept: "application/json" ,
                                Authorization: token
                            },
                            form: {
                                username: username,
                                permission: permission,
                                recursive: false
                            },
                            json: true
                        };

                        console.log("Sending POST", url, username, permission);
                        return requestp(options);
                    });
//                 .catch(function (err) {
//                     console.error(err.message);
//                  res.status(500).send("Agave permissions request failed");
//              });
            })
        );
    }

    function agaveGetFilePermissions(username, token, filepath) {
        var url = config.agaveBaseUrl + "/files/v2/pems/system/data.iplantcollaborative.org" + filepath;
        var options = {
            method: "GET",
            uri: url,
            headers: {
                Accept: "application/json" ,
                Authorization: token
            },
            form: {
                username: username,
                recursive: false
            },
            json: true
        };

        console.log("Sending GET", url, username);
        return requestp(options)
            .then(response => {
                if (response && response.result) {
                    var user = response.result.find(user => user.username == username);
                    if (user && user.permission) {
                        if (user.permission.write)
                            return "READ_WRITE";
                        if (user.permission.read)
                            return "READ";
                    }
                }

                return "NONE";
            });
    }

    function toAgavePermission(perm) {
        if (perm) {
            switch (perm.toLowerCase()) {
                case "owner": return "ALL";
                case "read-only": return "READ";
                case "read-write": return "READ_WRITE";
            }
        }

        return "NONE";
    }

    app.delete('/projects/:project_id(\\d+)/users/:user_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            requireProjectEditPermission(req.params.project_id, req.auth.user)
            // Get project and user for logging
            .then( () =>
                Promise.all([
                    models.project.findOne({
                        where: { project_id: req.params.project_id }
                    }),
                    models.user.findOne({
                        where: { user_id: req.params.user_id }
                    })
                ])
            )
            .then( results =>
                logAdd(req, {
                    title: "Remove user " + (results[1].first_name + " " + results[1].last_name) + " (" + results[1].user_name + ") from project '" + results[0].project_name + "'",
                    type: "removeUserFromProject",
                    project_id: req.params.project_id,
                    target_user_id: req.params.user_id
                })
            )
            .then( () =>
                models.project_to_user.destroy({
                    where: {
                        project_id: req.params.project_id,
                        user_id: req.params.user_id
                    }
                })
            )
        );
    });

    app.get('/pubchase', function(req, res, next) {
        toJsonOrError(res, next,
            models.pubchase.findAll()
        );
    });

    app.get('/publications', function(req, res, next) {
        toJsonOrError(res, next,
            models.publication.findAll({
                attributes: [ 'publication_id', 'title', 'author' ],
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    }
                ]
            })
        );
    });

    app.get('/publications/:id(\\d+)', function(req, res, next) {
        toJsonOrError(res, next,
            models.publication.findOne({
                where: { publication_id: req.params.id },
                include: [
                    { model: models.project },
                    { model: models.project_file
                    , attributes: [ 'project_file_id', 'project_id', 'file', 'description' ]
                    , include: [ { model: models.project_file_type } ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        );
    });

    app.put('/publications', function(req, res, next) { //FIXME change route to be projects/publications?
        requireAuth(req);

        var projectId = req.body.project_id;
        errorOnNull(projectId);

        toJsonOrError(res, next,
            requireProjectEditPermission(projectId, req.auth.user)
            .then( () =>
                models.publication.create({
                    project_id: projectId,
                    title: req.body.title,
                    author: req.body.authors,
                    pub_date: req.body.date,
                    pubmed_id: req.body.pubmed_id,
                    doi: req.body.doi
                })
            )
            .then( publication =>
                models.project.findOne({ where: { project_id: projectId } })
                .then( project =>
                    logAdd(req, {
                        title: "Add publication '" + publication.get().title + "' to project '" + project.project_name + "'",
                        type: "addPublication",
                        project_id: projectId,
                        publication_id: publication.get().publication_id
                    })
                    .then( () => publication )
                )
            )
        );
    });

    app.post('/publications/:publication_id(\\d+)', function (req, res, next) { //FIXME change route to be projects/publications?
        requireAuth(req);

        toJsonOrError(res, next,
            models.publication.findOne({ where: { publication_id: req.params.publication_id } })
            .then( publication =>
                requireProjectEditPermission(publication.project_id, req.auth.user)
                .then( () =>
                    logAdd(req, {
                        title: "Update publication '" + publication.title + "'",
                        type: "updatePublication",
                        publication_id: req.params.publication_id
                    })
                )
            )
            .then( () =>
                models.publication.update(
                    { title: req.body.title,
                      author: req.body.authors,
                      pub_date: req.body.date,
                      pubmed_id: req.body.pubmed_id,
                      doi: req.body.doi
                    },
                    { where: { publication_id: req.params.publication_id } }
                )
            )
            .then( result =>
                models.publication.findOne({
                    where: { publication_id: req.params.publication_id }
                })
            )
        );
    });

    app.delete('/publications/:publication_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            models.publication.findOne({ where: { publication_id: req.params.publication_id } })
            .then( publication =>
                requireProjectEditPermission(publication.project_id, req.auth.user)
                .then( () =>
                    logAdd(req, {
                        title: "Remove publication '" + publication.title + "'",
                        type: "removePublication",
                        publication_id: req.params.publication_id
                    })
                )
            )
            .then( () =>
                models.publication.destroy({
                    where: { publication_id: req.params.publication_id }
                })
            )
        );
    });

    app.get('/search/:query', function (req, res, next) {
        getSearchResults(req.params.query)
        .then( data => res.json(data) );
    });

    app.get('/samples/search_params', function (req, res, next) {
        mongo()
        .then((db)   => getSampleKeys(db))
        .then((data) => res.json(data))
        .catch((err) => res.status(500).send(err));
    });

    app.post('/samples/search_param_values', jsonParser, function (req, res, next) {
      var param = req.body.param;
      var query = req.body.query;

      mongo()
        .then(db =>
          Promise.all([getSampleKeys(db, param), getMetaParamValues(db, param, query)]))
          .then(filterMetaParamValues)
          .then(data => res.json({[param]: data}))
          .catch(err => res.status(500).send("Error: " + JSON.stringify(err)));
    });

    app.get('/samples/:id(\\d+)', function (req, res, next) {
        toJsonOrError(res, next,
            checkSamplePermissions(req.params.id, req.auth.user)
            .then( () => {
                return Promise.all([
                    models.sample.findOne({
                        where: { sample_id: req.params.id },
                        include: [
                            { model: models.project
                            , include: [
                                    { model: models.user
                                    , attributes: ['user_id', 'user_name', 'first_name', 'last_name', SAMPLE_PERMISSION_ATTR]
                                    , through: { attributes: [] } // remove connector table from output
                                    },
                                    { model: models.project_group
                                    , attributes: [ 'project_group_id', 'group_name' ]
                                    , through: { attributes: [] } // remove connector table from output
                                    , include: [
                                        { model: models.user
                                        , attributes: ['user_id', 'user_name', PROJECT_GROUP_PERMISSION_ATTR ]
                                        , through: { attributes: [] } // remove connector table from output
                                        }
                                      ]
                                    }
                                ]
                            },
                            { model: models.investigator
                            , through: { attributes: [] } // remove connector table from output
                            },
                            { model: models.sample_file,
                              include: [
                                { model: models.sample_file_type }
                              ]
                            },
                            { model: models.ontology
                            , through: { attributes: [] } // remove connector table from output
                            },
                            { model: models.assembly },
                            { model: models.combined_assembly },
                            { model: models.sample_attr,
                              include: [
                                  { model: models.sample_attr_type,
                                    include: [ models.sample_attr_type_alias ]
                                  }
                              ]
                            }
                        ]
                    }),

                    models.sample.aggregate('sample_type', 'DISTINCT', { plain: false }),

                    models.uproc_pfam_result.count({
                        where: { sample_id: req.params.id },
                    }),

                    models.uproc_pfam_result.count({
                        where: { sample_id: req.params.id },
                    }),

                    models.sample_to_centrifuge.count({
                        where: { sample_id: req.params.id }
                    })
                ])
            })
            .then( results => {
                var sample = results[0];
                sample.dataValues.available_types = results[1].map( obj => obj.DISTINCT).filter(s => (typeof s != "undefined" && s)).sort();
                sample.dataValues.protein_count = results[2] + results[3];
                sample.dataValues.centrifuge_count = results[4];
                return sample;
            })
        );
    });

    app.get('/samples/:id(\\d+)/proteins', function (req, res, next) {
        // TODO private samples currently do not have associated protein results, however in the future need to check pemissions
        toJsonOrError(res, next,
            Promise.all([
                models.uproc_pfam_result.findAll({
                    where: { sample_id: req.params.id },
                    include: [{
                        model: models.pfam_annotation,
                        attributes: [ 'accession', 'identifier', 'name', 'description' ]
                    }]
                }),

                models.uproc_kegg_result.findAll({
                    where: { sample_id: req.params.id },
                    include: [{
                        model: models.kegg_annotation,
                        attributes: [ 'name', 'definition', 'pathway', 'module' ]
                    }]
                })
            ])
            .then( results => {
                return {
                    pfam: results[0],
                    kegg: results[1]
                };
            })
        );
    });

    app.get('/samples/:id(\\d+)/centrifuge_results', function (req, res, next) {
        // TODO private samples currently do not have associated centrifuge results, however in the future need to check pemissions
        toJsonOrError(res, next,
            models.sample_to_centrifuge.findAll({
                where: { sample_id: req.params.id },
                attributes: [ 'sample_to_centrifuge_id', 'num_reads', 'num_unique_reads', 'abundance' ],
                include: [{
                    model: models.centrifuge
                }]
            })
        );
    });

    app.get('/samples', function(req, res, next) {
        var params = {
            attributes:
                [ 'sample_id'
                , 'sample_name'
                , 'sample_acc'
                , 'sample_type'
                , 'project_id'
                , [ sequelize.literal('(SELECT COUNT(*) FROM sample_file WHERE sample_file.sample_id = sample.sample_id)'), 'sample_file_count' ]
                ],
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name', 'private' ]
                //, where: PROJECT_PERMISSION_CLAUSE //NOT WORKING, see manual filter step below
                , include: [
                    { model: models.user
                    , attributes: ['user_id', 'user_name', 'first_name', 'last_name', SAMPLE_PERMISSION_ATTR]
                    , through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.project_group
                    , attributes: ['project_group_id', 'group_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    , include: [
                        { model: models.user
                        , attributes: ['user_id', 'user_name', 'first_name', 'last_name', PROJECT_GROUP_PERMISSION_ATTR ]
                        , through: { attributes: [] } // remove connector table from output
                        }
                      ]
                    }
                  ]
                }
            ]
        };

        if (typeof req.query.id !== 'undefined') {
            var ids = req.query.id.split(',');
            params.where = { sample_id: { in: ids } };
        }

        toJsonOrError(res, next,
            models.sample.findAll(params)
            .then(samples => { // filter by permission -- workaround for broken clause above
                return samples.filter(sample => {
                    var hasUserAccess = sample.project.users.map(u => u.user_name).includes(req.auth.user.user_name);
                    var hasGroupAccess = sample.project.project_groups.reduce((acc, g) => acc.concat(g.users), []).map(u => u.user_name).includes(req.auth.user.user_name);
                    return !sample.project.private
                        || (req.auth.user && req.auth.user.user_name
                            && (hasUserAccess || hasGroupAccess));
                })
            })
        );
    });

    app.put('/samples', function(req, res, next) {
        requireAuth(req);

        var sample_name = req.body.sample_name;
        var project_id = req.body.project_id;

        errorOnNull(sample_name, project_id);

        toJsonOrError(res, next,
            requireProjectEditPermission(project_id, req.auth.user)
            .then( () =>
                models.sample.create({
                    sample_name: sample_name,
                    sample_code: "__"+sample_name,
                    project_id: project_id
                })
            )
            .then( sample =>
                logAdd(req, {
                    title: "Add sample '" + sample_name + "'",
                    type: "addSample",
                    sample_id: sample.sample_id
                })
                .then( () => { return sample })
            )
            .then( sample =>
                mongo()
                    .then( db =>
                        db.collection('sample').insert({
                            specimen__sample_id: sample.sample_id,
                            specimen__sample_name: sample_name,
                            specimen__project_id: project_id
                        })
                    )
                    .then( () => { return sample } )
            )
            .then( sample =>
                models.sample.findOne({
                    where: { sample_id: sample.sample_id },
                    include: [
                        { model: models.project }
                    ]
                })
            )
        );
    });

    app.post('/samples/:sample_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            checkSamplePermissions(req.params.sample_id, req.auth.user)
            .then( () =>
                models.sample.update(
                    { sample_name: req.body.sample_name,
                      sample_acc: req.body.sample_code,
                      sample_type: req.body.sample_type
                    },
                    { where: { sample_id: req.params.sample_id } }
                )
            )
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: req.params.sample_id },
                    include: [
                        { model: models.project },
                    ]
                })
                .then( sample =>
                    logAdd(req, {
                        title: "Update sample '" + sample.sample_name + "'",
                        type: "updateSample",
                        sample_id: sample.sample_id
                    })
                    .then( () => sample )
                )
            )
        );
    });

    app.delete('/samples/:sample_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            checkSamplePermissions(req.params.sample_id, req.auth.user)
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: req.params.sample_id },
                })
            )
            .then( sample =>
                requireProjectEditPermission(sample.project_id, req.auth.user)
                .then( () => sample )
            )
            .then( sample =>
                logAdd(req, {
                    title: "Remove sample '" + sample.sample_name + "'",
                    type: "removeSample",
                    sample_id: sample.sample_id
                })
            )
            // Remove file entries from MySQL DB
            .then( () =>
                models.sample_file.destroy({ //TODO is this necessary or handled by cascade?
                    where: { sample_id: req.params.sample_id }
                })
            )
            // Remove sample from MySQL DB
            .then( () =>
                models.sample.destroy({
                    where: { sample_id: req.params.sample_id }
                })
            )
            // Update sample key counts
            .then( () =>
                decrementSampleKeys(req.params.sample_id)
            )
            // Remove sample from Mongo DB
            .then( () =>
                mongo()
                .then( db =>
                    db.collection('sample').remove({ "specimen__sample_id": 1*req.params.sample_id })
                )
            )
        );
    });

    app.put('/samples/:sample_id(\\d+)/attributes', function(req, res, next) {
        requireAuth(req);

        var sample_id = req.params.sample_id;
        var attr_type = req.body.attr_type;
        var attr_aliases = req.body.attr_aliases;
        var attr_value = req.body.attr_value;

        errorOnNull(sample_id, attr_type, attr_value);

        var aliases = (attr_aliases ? attr_aliases.split(",").map(s => s.trim()) : []);

        toJsonOrError(res, next,
            checkSamplePermissions(sample_id, req.auth.user)
            .then( () =>
                logAdd(req, {
                    title: "Add sample attribute " + attr_type + " = " + attr_value,
                    type: "addSampleAttribute",
                    sample_id: req.params.sample_id,
                    attr_type: req.body.attr_type,
                    attr_value: req.body.attr_value
                })
            )
            // Create attribute type
            .then( () =>
                models.sample_attr_type.findOrCreate({
                    where: { type: attr_type }
                })
                .spread( (sample_attr_type, created) => {
                    return sample_attr_type;
                })
            )
            // Create attribute and type aliases
            .then( sample_attr_type =>
                Promise.all(
                    aliases.map(alias =>
                        models.sample_attr_type_alias.findOrCreate({
                            where: {
                                sample_attr_type_id: sample_attr_type.sample_attr_type_id,
                                alias: alias
                            }
                        })
                    )
                    .push(
                        models.sample_attr.findOrCreate({
                            where: {
                                sample_attr_type_id: sample_attr_type.sample_attr_type_id,
                                sample_id: sample_id,
                                attr_value: attr_value
                            }
                        })
                    )
                )
            )
            // Add attribute to Mongo DB
            .then( () =>
                mongo()
                .then( db => {
                    var key = "specimen__" + attr_type;
                    var obj = {};
                    obj[key] = attr_value;

                    db.collection('sample').updateOne(
                        { "specimen__sample_id": 1*sample_id },
                        { $set: obj }
                    );

                    return incrementSampleKey(db, key, attr_value);
                })
            )
            // Return sample with updated attributes
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: sample_id },
                    include: [
                        { model: models.project },
                        { model: models.sample_attr,
                          include: [
                              { model: models.sample_attr_type,
                                include: [ models.sample_attr_type_alias ]
                              }
                          ]
                        }
                    ]
                })
            )
        );
    });

    app.post('/samples/:sample_id(\\d+)/attributes/:attr_id(\\d+)', function(req, res, next) {
        requireAuth(req);

        var sample_id = req.params.sample_id;
        var attr_id = req.params.attr_id;
        var attr_type = req.body.attr_type;
        var attr_aliases = req.body.attr_aliases;
        var attr_value = req.body.attr_value;

        errorOnNull(sample_id, attr_id, attr_type, attr_value);

        var aliases = (attr_aliases ? attr_aliases.split(",").map(s => s.trim()) : []);

        toJsonOrError(res, next,
            checkSamplePermissions(sample_id, req.auth.user)
            .then( () =>
                logAdd(req, {
                    title: "Update sample attribute " + attr_type + " = " + attr_value,
                    type: "updateSampleAttribute",
                    sample_id: req.params.sample_id,
                    attr_type: req.body.attr_type,
                    attr_value: req.body.attr_value
                })
            )
            // Get attribute type
            .then( () =>
                models.sample_attr_type.findOne({
                    where: { type: attr_type },
                    include: [ models.sample_attr_type_alias ]
                })
            )
            // Update attribute value
            .then( sample_attr_type =>
                models.sample_attr.update(
                    { sample_attr_type_id: sample_attr_type.sample_attr_type_id,
                      attr_value: attr_value
                    },
                    { where: { sample_attr_id: attr_id } }
                )
                .then( () => {
                    var currentAliases = sample_attr_type.sample_attr_type_aliases;
                    var aliasesToAdd = aliases.filter(function(s) { return currentAliases.indexOf(s) < 0; });
                    var aliasesToDelete = currentAliases.filter(function(a) { return aliases.indexOf(a.alias) < 0; });
                    console.log("delete:", aliasesToDelete)

                    return Promise.all(
                        aliasesToAdd.map(alias =>
                            models.sample_attr_type_alias.findOrCreate({
                                where: {
                                    sample_attr_type_id: sample_attr_type.sample_attr_type_id,
                                    alias: alias
                                }
                            })
                        )
                        .concat(
                            aliasesToDelete.map(alias =>
                                models.sample_attr_type_alias.destroy({
                                    where: {
                                        sample_attr_type_id: sample_attr_type.sample_attr_type_id,
                                        alias: alias.alias
                                    }
                                })
                            )
                        )
                    )
                })
            )
            // Add to Mongo DB sample doc
            .then( () =>
                mongo()
                .then( db => {
                    var obj = {};
                    obj["specimen__"+attr_type] = attr_value;

                    db.collection('sample').updateOne(
                        { "specimen__sample_id": 1*sample_id },
                        { $set: obj }
                    );

                })
            )
            // Return sample with updated attributes
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: sample_id },
                    include: [
                        { model: models.project },
                        { model: models.sample_attr,
                          include: [
                              { model: models.sample_attr_type,
                                include: [ models.sample_attr_type_alias ]
                              }
                          ]
                        }
                    ]
                })
            )
        );
    });

    app.delete('/samples/:sample_id(\\d+)/attributes/:attr_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        //TODO delete unused sample_attr_type_alias entries

        toJsonOrError(res, next,
            checkSamplePermissions(req.params.sample_id, req.auth.user)
            // Get attribute
            .then( () =>
                models.sample_attr.findOne({
                    where: { sample_attr_id: req.params.attr_id },
                    include: [
                        models.sample_attr_type
                    ]
                })
            )
            // Remove from Mongo DB using type name
            .then( sample_attr =>
                logAdd(req, {
                    title: "Remove sample attribute '" + sample_attr.sample_attr_type.type + "'",
                    type: "removeSampleAttribute",
                    sample_id: req.params.sample_id,
                    attr_id: req.body.attr_id
                })
                .then( () =>
                    mongo()
                    .then( db => {
                        var obj = {};
                        obj["specimen__"+sample_attr.sample_attr_type.type] = "";

                        db.collection('sample').updateOne(
                            { "specimen__sample_id": 1*req.params.sample_id },
                            { $unset: obj }
                        )
                    })
                )
            )
            // Remove from MySQL DB using id
            .then( () =>
                models.sample_attr.destroy({
                    where: { sample_attr_id: req.params.attr_id }
                })
            )
            // Return sample with updated attributes
            .then( () => {
                return models.sample.findOne({
                    where: { sample_id: req.params.sample_id },
                    include: [
                        { model: models.project },
                        { model: models.sample_attr,
                          include: [
                              { model: models.sample_attr_type,
                                include: [ models.sample_attr_type_alias ]
                              }
                          ]
                        }
                    ]
                })
            })
        );
    });

    app.get('/samples/files', function(req, res, next) {
        var params = {
            attributes:
                [ 'sample_file_id'
                , 'sample_id'
                , 'file'
                ],
            include: [
                { model: models.sample
                , attributes: [ 'sample_id', 'sample_name' ]
                },
                { model: models.sample_file_type
                , attributes: [ 'sample_file_type_id', 'type' ]
                }
            ]
        };

        if (typeof req.query.id !== 'undefined') {
            var ids = req.query.id.split(',');
            params.where = { sample_id: { in: ids } };
        }

        //TODO check permissions

        toJsonOrError(res, next,
            models.sample_file.findAll(params)
        );
    });

    app.put('/samples/:sample_id/files', function(req, res, next) {
        requireAuth(req);

        var files = req.body.files;
        console.log("files: ", files);

        errorOnNull(files);

        toJsonOrError(res, next,
            checkSamplePermissions(req.params.sample_id, req.auth.user)
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: req.params.sample_id }
                })
            )
            .then( sample =>
                logAdd(req, {
                    title: "Add " + files.length + " files to sample '" + sample.sample_name + "'",
                    type: "addSampleFiles",
                    sample_id: sample.sample_id,
                    files: files
                })
            )
            .then( () =>
                Promise.all(
                    files.map( file =>
                        models.sample_file.findOrCreate({
                            where: {
                                sample_id: req.params.sample_id,
                                sample_file_type_id: 1,
                                file: file
                            }
                        })
                    )
                )
            )
            .then( updateSampleFilePermissions(req.params.sample_id, req.headers.authorization, files) )
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: req.params.sample_id },
                    include: [
                        { model: models.project },
                        { model: models.sample_file,
                          include: [
                            { model: models.sample_file_type,
                              attributes: [ 'sample_file_type_id', 'type' ]
                            }
                          ]
                        }
                    ]
                })
            )
        );
    });

    app.post('/samples/:sample_id(\\d+)/files/:file_id(\\d+)', function(req, res, next) {
        requireAuth(req);

        var sample_id = req.params.sample_id;
        var sample_file_id = req.params.file_id;
        var type_id = req.body.type_id;

        errorOnNull(sample_id, type_id);

        toJsonOrError(res, next,
            checkSamplePermissions(sample_id, req.auth.user)
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: req.params.sample_id }
                })
            )
            .then( sample =>
                logAdd(req, {
                    title: "Update file " + sample_file_id + " for sample '" + sample.sample_name + "'",
                    type: "updateSampleFile",
                    sample_id: sample_id,
                    sample_file_id: sample_file_id,
                    type_id: type_id
                })
            )
            .then( () =>
                models.sample_file.update(
                    { sample_file_type_id: type_id },
                    { where: { sample_file_id: sample_file_id } }
                )
            )
            .then( () =>
                "success"
            )
        );
    });

    app.delete('/samples/:sample_id(\\d+)/files/:file_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            checkSamplePermissions(req.params.sample_id, req.auth.user)
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: req.params.sample_id }
                })
            )
            .then( sample =>
                logAdd(req, {
                    title: "Remove file " + req.params.file_id + " from sample '" + sample.sample_name + "'",
                    type: "removeSampleFile",
                    sample_id: req.params.sample_id,
                    sample_file_id: req.params.file_id
                })
            )
            .then( () =>
                models.sample_file.destroy({
                    where: { sample_file_id: req.params.file_id }
                })
            )
            .then( () =>
                models.sample.findOne({
                    where: { sample_id: req.params.sample_id },
                    include: [
                        { model: models.project },
                        { model: models.sample_file,
                          include: [
                            { model: models.sample_file_type,
                              attributes: [ 'sample_file_type_id', 'type' ]
                            }
                          ]
                        }
                    ]
                })
            )
        );
    });

    app.post('/samples/search', jsonParser, function (req, res, next) {
        console.log(req.body);

        mongo()
        .then( db => getMetaSearchResults(db, req.body) )
        .then( data => {
            // Add user permission info
            var samplesById = {};
            var sampleIds = data.map( s => {
                samplesById[s.specimen__sample_id] = {};
                samplesById[s.specimen__sample_id]["attributes"] = s;
                return s.specimen__sample_id
            });

            return models.sample.findAll({
                where: { sample_id: { $in: sampleIds } },
                include: [
                    { model: models.project
                    //, attributes: [ 'project_id', 'project_name' ]
                    , include: [
                            { model: models.user
                            , attributes: ['user_id', 'user_name', 'first_name', 'last_name', SAMPLE_PERMISSION_ATTR]
                            , through: { attributes: [] } // remove connector table from output
                            }
                        ]
                    }
                ]
            })
            .then( samples => {
                samples.forEach(s => {
                    if (s.project.users)
                        samplesById[s.sample_id].users = s.project.users;
                });

                return Object.values(samplesById);
            });
        })
        .then( data => res.json(data) )
        .catch(next);
    });

    app.get('/samples/taxonomy_search/:query', function (req, res, next) {
        //TODO currently private samples do not have associated centrifuge results, but in the future will need to check permissions here
        toJsonOrError(res, next,
            models.centrifuge.findAll({
                where: sequelize.or(
                    { tax_id: req.params.query },
                    { name: { $like: '%'+req.params.query+'%' } }
                ),
                include: [
                    { model: models.sample,
                      attributes: [ 'sample_id', 'sample_name', 'project_id' ],
                      include: [
                        { model: models.project,
                          attributes: [ 'project_id', 'project_name' ]
                        }
                      ]
                    }
                ]
            })
        );
    });

    app.get('/samples/protein_search/:db/:query', function (req, res, next) {
        var db = req.params.db.toUpperCase();
        var query = req.params.query.toUpperCase();

        //TODO current private samples do not have associated protein results, but in the future will need to check permissions here

        if (db == "PFAM") {
            toJsonOrError(res, next,
                models.pfam_annotation.findAll({
                    where: sequelize.or(
                        { accession: query },
                        { identifier: query }
                        //{ name: { $like: '%'+query+'%' } },           // removed, very slow
                        //{ description: { $like: '%'+query+'%' } }
                    ),
                    include: [
                        { model: models.uproc_pfam_result,
                          attributes: [ 'sample_to_uproc_id', 'read_count' ],
                          include: [{
                            model: models.sample,
                            attributes: [ 'sample_id', 'sample_name', 'project_id' ],
                            include: [
                                { model: models.project,
                                  attributes: [ 'project_id', 'project_name' ]
                                }
                              ]
                          }]
                        }
                    ]
                })
            );
        }
        else if (db == "KEGG") {
            toJsonOrError(res, next,
                models.kegg_annotation.findAll({
                    where: sequelize.or(
                        { kegg_annotation_id: query },
                        { name: { $like: '%'+query+'%' } }
                        //{ definition: { $like: '%'+query+'%' } },     // removed, very slow
                        //{ pathway: { $like: '%'+query+'%' } }
                    ),
                    include: [
                        { model: models.uproc_kegg_result,
                          attributes: [ 'uproc_kegg_result_id', 'read_count' ],
                          include: [{
                            model: models.sample,
                            attributes: [ 'sample_id', 'sample_name', 'project_id' ],
                            include: [
                                { model: models.project,
                                  attributes: [ 'project_id', 'project_name' ]
                                }
                              ]
                          }]
                        }
                    ]
                })
            );
        }
        else {
            res.json([]);
        }
    });

    app.get('/users', function(req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            models.user.findAll({
                where: {
                    $or: {
                        user_name: { $like: "%"+req.query.term+"%" },
                        first_name: { $like: "%"+req.query.term+"%" },
                        last_name: { $like: "%"+req.query.term+"%" }
                    }
                }
            })
        );
    });

    app.get('/users/:id(\\d+)', function(req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            Promise.all([
                models.user.findOne({
                    where: { user_id: req.params.id },
                    include: [
                        { model: models.project,
                          through: { attributes: [] }, // remove connector table from output
                          include: [
                            { model: models.investigator,
                              through: { attributes: [] } // remove connector table from output
                            },
                            { model: models.publication },
                            { model: models.sample,
                              attributes: [
                                "sample_id",
                                "sample_name",
                                "sample_acc",
                                "sample_type",
                                [ sequelize.literal('(SELECT COUNT(*) FROM sample_file WHERE sample_file.sample_id = `projects->samples`.`sample_id`)'), 'sample_file_count' ]
                              ],
                              include: [
                                { model: models.sample_file },
                                { model: models.project
                                }
                              ]
                            }
                          ]
                        }
                    ]
                }),
                mongo()
                .then( db => {
                    return new Promise(function (resolve, reject) {
                        db.collection('log').find(
                            { user_id: req.params.id*1 } // ensure integer value
                        )
                        .sort({ date: 1 })
                        .toArray( (err, items) => {
                            if (err)
                                reject(err);
                            resolve(items);
                        });
                    });
                })
            ])
            .then( results => {
                var user = results[0];
                user.dataValues.log = results[1];
                return user;
            })
        );
    });

    app.get('/users/:name([\\w\\.\\-\\_]+)', function(req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            models.user.findOne({
                where: { user_name: req.params.name }
            })
        );
    });

    app.post('/users/login', function(req, res, next) {
        requireAuth(req);

        var username = req.auth.user.user_name;
        errorOnNull(username);

        models.user.findOrCreate({
            where: { user_name: username }
        })
        .spread( (user, created) => {
            models.login.create({
                user_id: user.user_id,
                login_date: sequelize.fn('NOW')
            })
            .then( login =>
                res.json({ // Respond w/o login_date: this is a workaround to prevent Elm decoder from failing on login_date = "fn":"NOW"
                    login_id: login.login_id,
                    user: user
                })
            );
        })
        .catch(next);
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

function toJsonOrError(res, next, promise) {
    promise
    .then(result => {
        if (!result)
            throw(new MyError("Not found", 404));
        else {
            res.json(result);
            console.log("RESPONSE ".padEnd(80, "-"));
        }
    })
    .catch(next);
}

function checkProjectPermissions(projectId, user) {
    return models.project.findOne({
        where: { project_id: projectId },
        include: [
            { model: models.project_group
            , attributes: [ 'project_group_id', 'group_name' ]
            , through: { attributes: [] } // remove connector table from output
            , include: [
                { model: models.user
                , attributes: [ 'user_id', 'user_name',
                    [ sequelize.literal(
                        '(SELECT permission FROM project_group_to_user WHERE project_group_to_user.user_id = `project_groups->users`.`user_id` AND project_group_to_user.project_group_id = project_group_id)'
                      ),
                      'permission'
                    ]
                  ]
                , through: { attributes: [] } // remove connector table from output
                }
              ]
            },
            { model: models.user
            , attributes: [ 'user_id', 'user_name',
                [ sequelize.literal(
                    '(SELECT permission FROM project_to_user WHERE project_to_user.user_id = users.user_id AND project_to_user.project_id = project.project_id)'
                  ),
                  'permission'
                ]
              ]
            , through: { attributes: [] } // remove connector table from output
            }
        ]
    })
    .then( project => {
        if (!project)
            throw(ERR_NOT_FOUND);

        var userPerm =
            project.users &&
                project.users
                .filter(u => u.user_id == user.user_id)
                .reduce((acc, u) => Math.min(u.get().permission, acc), PERMISSION_READ_ONLY);

        var groupPerm =
            project.project_groups &&
                project.project_groups
                .reduce((acc, g) => acc.concat(g.users), [])
                .filter(u => u.user_id == user.user_id)
                .reduce((acc, u) => Math.min(u.get().permission, acc), PERMISSION_READ_ONLY);

        console.log("user permission:", userPerm);
        console.log("group permission:", groupPerm);
        if (!userPerm && !groupPerm)
            throw(ERR_PERMISSION_DENIED);

        return Math.min(userPerm, groupPerm);
    });
}

function checkSamplePermissions(sampleId, user) {
    return models.sample.findOne({
        where: { sample_id: sampleId }
    })
    .then( sample => {
        if (!sample)
            throw(ERR_NOT_FOUND);

        return checkProjectPermissions(sample.project_id, user);
    });
}

function requireProjectEditPermission(projectId, user) {
    return checkProjectPermissions(projectId, user)
        .then( permission => {
            if (permission >= PERMISSION_READ_ONLY)
                throw(ERR_PERMISSION_DENIED);

            console.log("User " + user.user_name + "/" + user.user_id + " has edit access");
            return permission;
        });
}

function errorOnNull() {
    if (arguments) {
        var notNull = Object.values(arguments).every( x => { return (typeof x !== "undefined") } );
        if (!notNull)
            throw(ERR_BAD_REQUEST);
    }
}

function requireAuth(req) {
    if (!req || !req.auth || !req.auth.validToken && !req.auth.user)
        throw(ERR_UNAUTHORIZED);
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
                where: { user_name: profile.username }
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

function getSampleKeys(db, optField) {
  /*
   * Keys look like this:
   *
   * { _id: { key: 'specimen__volume' },
   *  value: { types: { Number: 190, String: 16 } },
   *  totalOccurrences: 206,
   *  percentContaining: 4.092173222089789 }
   *
   * We need to take the most frequent of the "types"
   * and return just
   *
   * { 'specimen__volume': 'number' }
   *
   */
  return new Promise(function (resolve, reject) {
    var col = db.collection('sampleKeys');
    var qry = ((typeof(optField) != "undefined") && (optField != ""))
              ? { _id: { key: optField } }
              : {};
    console.log(qry);

    col.find(qry).toArray(function(err, docs) {
      if (err)
        reject(err);
      else {
        var keys = docs.filter((item) => {
          var name = item._id.key;
          return (name !== "" && name !== "_id");
        }).reduce((acc, item) => {
          var name  = item._id.key;
          var types = item.value.types;
          var type  = Object.keys(types)
            .sort((a,b) => types[a] - types[b])
            .reverse()[0];
          acc[name] = type.toLowerCase();
          return acc;
        }, {});

        resolve(keys);
      }
    });
  });
}

function getMetaParamValues(db, fieldName, query) {
  if (typeof(query) == "undefined")
    query = {}

  var qry = fixMongoQuery(query);

  return new Promise(function (resolve, reject) {
    db.command(
      { distinct: "sample", key: fieldName, query: qry },
      function (err, res) {
        if (!err && res.ok)
          resolve(res['values'])
        else
          reject(err)
      }
    );
  });
}

function filterMetaParamValues(args) {
  var [dataType, data] = args

  var type = (typeof(dataType) == "object" && Object.keys(dataType).length == 1)
             ? Object.values(dataType)[0]
             : undefined;

  var f = function (val) { return type ? typeof(val) == type : true }
  var sorter = type == 'number'
    ? function (a, b) { return a - b }
    : function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()) };

  return Promise.resolve(data.filter(f).sort(sorter));
}

function fixMongoQuery(query) {
  return Object.keys(query)
    .filter(x => { return !(query[x] == null || query[x].length == 0) })
    .reduce(
    (acc, key) => {
      var val = query[key]

      // e.g., { min__biological__chlorophyll: 1 }
      if (key.match(/^(min|max)__/)) {
        var prefix = key.substr(0, 3)
        var param  = key.substr(5)

        if (acc[param] == undefined)
          acc[param] = {}

        var op = prefix == 'min' ? '$gte' : '$lte'
        acc[param][op] = val
      }
      // e.g., { environment__general_weather: "cloudy" }
      else if (Array.isArray(val)) {
        if (acc[key] == undefined)
          acc[key] = {}

        acc[key]['$in'] = val
      }
      else
        acc[key] = val

      return acc
    },
    {}
  );
}

function getMetaSearchResults(db, query) {
  return new Promise(function (resolve, reject) {
    if (typeof(query) == "object") {
      if (!Object.keys(query).length)
        resolve([]);

      var qry = fixMongoQuery(query);

      // I don't want the "text" field in the projection
      var project = { "text" : 0 };

      db.collection('sample').find(qry, project).toArray(
        function(err, docs) {
          if (err) reject(err);
          resolve(docs);
        }
      );
    }
    else {
      reject("Bad query (" + JSON.stringify(query) + ")");
    }
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
