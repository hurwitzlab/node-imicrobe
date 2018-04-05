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
const ERR_NOT_FOUND = new MyError("Not found", 404);


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

        sendmail({
            from: email,
            to: config.supportEmail,
            subject: 'Support req',
            html: message,
        }, (err, reply) => {
            console.log(err && err.stack);
            console.dir(reply);
        });

        res.json({
            status: "success"
        });
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
                name: req.body.name,
                institution: req.body.institution,
                url: req.body.url
            })
        );
    });

    app.get('/project_groups', function(req, res, next) {
        toJsonOrError(res, next,
            models.project_group.findAll({
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
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

    app.get('/projects/:id(\\d+)', function(req, res, next) {
        toJsonOrError(res, next,
            Promise.all([
                models.project.findOne({
                    where: {
                        project_id: req.params.id,
                        $or: [ // check permissions -- DO NOT MODIFY
                            { private: { $or: [0, null] } },
                            (req.auth.user ? sequelize.literal("users.user_name = '" + req.auth.user.user_name + "'") : {})
                        ]
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
                        },
                        { model: models.project_group
                        , attributes: [ 'project_group_id', 'group_name' ]
                        },
                        { model: models.user
                        , attributes: [ 'user_id', 'user_name' ]
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

    app.get('/projects/:id(\\d+)/assemblies', function (req, res, next) {
        toJsonOrError(res, next,
            models.assembly.findAll({
                where: { project_id: req.params.id },
                attributes: [ 'assembly_id', 'assembly_name' ]
            })
        );
    });

    app.get('/projects/:id(\\d+)/combined_assemblies', function (req, res, next) {
        toJsonOrError(res, next,
            models.combined_assembly.findAll({
                where: { project_id: req.params.id },
                attributes: [ 'combined_assembly_id', 'assembly_name' ]
            })
        );
    });

    app.get('/projects', function(req, res, next) {
        toJsonOrError(res, next,
            models.project.findAll({
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
                    , attributes: ['user_id', 'user_name']
                    , through: { attributes: [] } // remove connector table from output
                    },
                ],
                attributes: {
                    include: [[ sequelize.literal('(SELECT COUNT(*) FROM sample WHERE sample.project_id = project.project_id)'), 'sample_count' ]]
                }
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
        );
    });

    app.post('/projects/:project_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        // TODO check permissions on project

        var project_id = req.params.project_id;
        var project_name = req.body.project_name;
        var project_code = req.body.project_code;
        var project_type = req.body.project_type;
        var project_url = req.body.project_url;
        var domains = req.body.domains;
        var groups = req.body.groups;

        toJsonOrError(res, next,
            models.project.update(
                { project_name: project_name,
                  project_code: project_code,
                  project_type: project_type,
                  url: project_url
                },
                { where: { project_id: project_id } }
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
//            .then( () => // remove all groups from project
//                models.project_to_project_group.destroy({
//                    where: { project_id: project_id }
//                })
//            )
//            .then( () =>
//                Promise.all(
//                    groups.map( g =>
//                        models.project_to_project_group.findOrCreate({
//                            where: {
//                                project_id: project_id,
//                                project_group_id: g.project_group_id
//                            }
//                        })
//                    )
//                )
//            )
            .then( () =>
                models.project.findOne({
                    where: { project_id: project_id },
                    include: [
                        { model: models.project_group },
                        { model: models.domain }
                    ]
                })
            )
        );
    });

    app.put('/projects/:project_id(\\d+)/investigators/:investigator_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        // TODO check permissions on project

        toJsonOrError(res, next,
            models.project_to_investigator.findOrCreate({
                where: {
                    project_id: req.params.project_id,
                    investigator_id: req.params.investigator_id
                }
            })
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

        // TODO check permissions on project

        toJsonOrError(res, next,
            models.project_to_investigator.destroy({
                where: {
                    project_id: req.params.project_id,
                    investigator_id: req.params.investigator_id
                }
            })
        );
    });

    app.delete('/projects/:project_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        // TODO check permissions on project

        toJsonOrError(res, next,
            models.publication.destroy({ // FIXME add on cascade delete
                where: {
                    project_id: req.params.project_id
                }
            })
            .then(
                models.project.destroy({
                    where: {
                        project_id: req.params.project_id
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

    app.put('/publications', function(req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            models.publication.create({
                project_id: req.body.project_id,
                title: req.body.title,
                author: req.body.authors,
                pub_date: req.body.date,
                pubmed_id: req.body.pubmed_id,
                doi: req.body.doi
            })
        );
    });

    app.post('/publications/:id(\\d+)', function (req, res, next) {
        requireAuth(req);

        // TODO check permissions

        toJsonOrError(res, next,
            models.publication.update(
                { title: req.body.title,
                  author: req.body.authors,
                  pub_date: req.body.date,
                  pubmed_id: req.body.pubmed_id,
                  doi: req.body.doi
                },
                { where: { publication_id: req.params.iid } }
            )
            .then( result =>
                models.publication.findOne({
                    where: { publication_id: req.params.id }
                })
            )
        );
    });

    app.delete('/publications/:id(\\d+)', function (req, res, next) {
        requireAuth(req);

        //TODO check permissions

        toJsonOrError(res, next,
            models.publication.destroy({
                where: { publication_id: req.params.id }
            })
        );
    });

    app.get('/search/:query', function (req, res, next) {
        getSearchResults(req.params.query)
        .then( data => res.json(data) );
    });

    app.get('/search_params', function (req, res, next) {
        mongo()
        .then((db)   => getSampleKeys(db))
        .then((data) => res.json(data))
        .catch((err) => res.status(500).send(err));
    });

    app.post('/search_param_values', jsonParser, function (req, res, next) {
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
            Promise.all([
                models.sample.findOne({
                    where: { sample_id: req.params.id },
                    include: [
                        { model: models.project },
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
                        },
                        { model: models.user
                        , attributes: ['user_id', 'user_name']
                        , through: { attributes: [] } // remove connector table from output
                        }
                    ]
                }),

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
            .then( results => {
                var sample = results[0];
                sample.dataValues.protein_count = results[1] + results[2];
                sample.dataValues.centrifuge_count = results[3];
                return sample;
            })
        );
    });

    app.get('/samples/:id(\\d+)/proteins', function (req, res, next) {
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
        toJsonOrError(res, next,
            models.sample_to_centrifuge.findAll({
                where: { sample_id: req.params.id },
                attributes: [ 'sample_to_centrifuge_id', 'num_reads', 'num_unique_reads', 'abundance' ],
                include: [{
                    model: models.centrifuge,
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
                ],
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        };

        if (typeof req.query.id !== 'undefined') {
            var ids = req.query.id.split(',');
            params.where = { sample_id: { in: ids } };
        }

        toJsonOrError(res, next,
            models.sample.findAll(params)
        );
    });

    app.put('/samples', function(req, res, next) {
        requireAuth(req);

        //TODO check permissions on parent project

        var sample_name = req.body.sample_name;
        var project_id = req.body.project_id;

        errorOnNull(sample_name, project_id);

        toJsonOrError(res, next,
            models.sample.create({
                sample_name: sample_name,
                sample_code: "__"+sample_name,
                project_id: project_id,
                private: 1,
                sample_to_users: [
                    { user_id : req.auth.user.user_id
                    , permission: 1
                    }
                ]
            },
            { include: [ models.sample_to_user ]
            })
            .then( sample => {
                return models.sample.findOne({
                    where: { sample_id: sample.sample_id },
                    include: [
                        { model: models.project }
                    ]
                })
            })
        );
    });

    app.post('/samples/:id(\\d+)', function (req, res, next) {
        requireAuth(req);

        // TODO check permissions on sample

        toJsonOrError(res, next,
            models.sample.update(
                { sample_name: req.body.sample_name,
                  sample_acc: req.body.sample_code,
                  sample_type: req.body.sample_type
                },
                { where: { sample_id: req.params.id } }
            )
            .then( result =>
                models.sample.findOne({
                    where: { sample_id: req.params.id },
                    include: [
                        { model: models.project },
                    ]
                })
            )
        );
    });

    app.delete('/samples/:sample_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        //TODO check permissions

        models.sample_file.destroy({
            where: { sample_id: req.params.sample_id }
        })
        .then(
            models.sample.destroy({
                where: { sample_id: req.params.sample_id }
            })
        )
        .then( res.send("1") )
        .catch(next);
    });

    app.put('/samples/:sample_id(\\d+)/attributes', function(req, res, next) {
        requireAuth(req);

        var sample_id = req.params.sample_id;
        var attr_type = req.body.attr_type;
        var attr_aliases = req.body.attr_aliases;
        var attr_value = req.body.attr_value;

        errorOnNull(sample_id, attr_type, attr_value);

        toJsonOrError(res, next,
            // Check permissions on parent project/sample
            models.user.findOne({
                where: { user_name: req.auth.profile.username },
                include: [
                    { model: models.sample
                    , where: { sample_id: sample_id }
                    },
                    { model: models.project
                    , include: [
                        { model: models.sample
                        , where: { sample_id: sample_id }
                        }
                      ]
                    }
                ]
            })
            .then( user => {
                if (user.samples && user.samples.length > 0) {
                    return user.samples[0];
                }
                else if (user.projects && user.projects.length > 0 && user.projects[0].samples && user.projects[0].samples.length > 0) {
                    return user.projects[0].samples[0];
                }
                else {
                    console.log("Error: permission denied");
                    res.status(403).send("Error: permission denied");
                    return;
                }
            })
            .then( sample =>
                models.sample_attr_type.findOrCreate({
                    where: { type: attr_type }
                })
                .spread( (sample_attr_type, created) => {
                    console.log("type created: ", created);
                    return sample_attr_type
                })
            )
            .then( sample_attr_type =>
                models.sample_attr.findOrCreate({
                        where: {
                            sample_attr_type_id: sample_attr_type.sample_attr_type_id,
                            sample_id: sample_id,
                            attr_value: attr_value
                        }
                    })
                    .spread( (sample_attr, created) => {
                        console.log("attr created: ", created);
                    })
            )
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

        toJsonOrError(res, next,
            // Check permissions on parent project/sample
            models.user.findOne({
                where: { user_name: profile.username },
                include: [
                    { model: models.sample
                    , where: { sample_id: sample_id }
                    },
                    { model: models.project
                    , include: [
                        { model: models.sample
                        , where: { sample_id: sample_id }
                        }
                      ]
                    }
                ]
            })
            .then( user => {
                if (user.samples && user.samples.length > 0) {
                    return user.samples[0];
                }
                else if (user.projects && user.projects.length > 0 && user.projects[0].samples && user.projects[0].samples.length > 0) {
                    return user.projects[0].samples[0];
                }
                else {
                    console.log("Error: permission denied");
                    res.status(403).send("Error: permission denied");
                    return;
                }
            })
            .then( sample =>
                models.sample_attr_type.findOrCreate({
                    where: { type: attr_type }
                })
                .spread( (sample_attr_type, created) => {
                    console.log("type created: ", created);
                    return sample_attr_type
                })
            )
            .then( sample_attr_type =>
                models.sample_attr.update(
                    { sample_attr_type_id: sample_attr_type.sample_attr_type_id,
                      attr_value: attr_value
                    },
                    { where: {
                        sample_attr_id: attr_id
                      }
                    }
                )
            )
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

        //TODO check permissions

        toJsonOrError(res, next,
            models.sample_attr.destroy({
                where: { sample_attr_id: req.params.attr_id }
            })
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

        toJsonOrError(res, next,
            models.sample_file.findAll(params)
        );
    });

    app.put('/samples/:sample_id/files', function(req, res, next) {
        requireAuth(req);

        //TODO check permissions

        var files = req.body.files;

        errorOnNull(files);

        toJsonOrError(res, next,
            Promise.all(
                files.map( file =>
                    models.sample_file.findOrCreate({
                        where: {
                            sample_id: req.params.sample_id,
                            sample_file_type_id: 1,
                            file
                        }
                    })
                )
            )
            .then( () => {
                return models.sample.findOne({
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
            })
        );
    });

    app.delete('/samples/:sample_id(\\d+)/files/:file_id(\\d+)', function (req, res, next) {
        requireAuth(req);

        //TODO check permissions

        toJsonOrError(res, next,
            models.sample_file.destroy({
                where: { sample_file_id: req.params.file_id }
            })
            .then( () => {
                return models.sample.findOne({
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
            })
        );
    });

    app.post('/samples/search', jsonParser, function (req, res, next) {
        mongo()
        .then((db)   => getMetaSearchResults(db, req.body))
        .then((data) => res.json(data))
        .catch(next);
    });

    app.get('/samples/taxonomy_search/:query', function (req, res, next) {
        toJsonOrError(res, next,
            models.centrifuge.findAll({
                where: sequelize.or(
                    { tax_id: query },
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
            models.user.findAll()
        );
    });

    app.get('/users/:id(\\d+)', function(req, res, next) {
        requireAuth(req);

        toJsonOrError(res, next,
            models.user.findOne({
                where: { user_id: req.params.id },
                include: [
                    { model: models.project,
                      through: { attributes: [] }, // remove connector table from output
                      include: [
                        { model: models.investigator,
                          through: { attributes: [] } // remove connector table from output
                        },
                        { model: models.publication }
                      ]
                    },
                    { model: models.sample,
                      through: { attributes: [] }, // remove connector table from output
                      include: [
                        { model: models.sample_file }
                      ]
                    }
                ]
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

        var user_name = req.body.user_name; // FIXME get username from token
        errorOnNull(user_name);

        models.user.findOrCreate({
            where: { user_name: user_name }
        })
        .spread( (user, created) => {
            models.login.create({
                user_id: user.user_id,
                login_date: sequelize.fn('NOW'),
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

    // catch-all function
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
    req.auth = {};

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
        console.log("validateAgaveToken: token", token);

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
