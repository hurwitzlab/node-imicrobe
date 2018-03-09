'use strict';

var printf      = require('printf');
var cors        = require('cors');
var Promise     = require('promise');
var bodyParser  = require('body-parser');
var jsonParser  = bodyParser.json();
var sendmail    = require('sendmail')();
var https       = require("https");
var requestp    = require('request-promise');
var querystring = require('querystring');
var mongo       = require('../config/mongo').mongo;
var sequelize   = require('../config/mysql').sequelize;
var models      = require('./models/index');

// Load config file
var config = require('../config.json');

module.exports = function(app) {
    app.use(cors());
    app.use(bodyParser.json()); // support json encoded bodies
    app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

    app.get('/apps', function(request, response) {
        console.log('GET /apps');

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
        .then( data => response.json(data) );
    });

    app.get('/apps/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /apps/' + id);

        models.app.findOne({
            where: { app_id: id },
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
        .then( app => {
            if (!app)
                throw new Error();
            response.json(app);
        })
        .catch((err) => {
            console.error("Error: App not found");
            response.status(404).send("App not found");
        });
    });

    app.get('/apps/:name([\\w\\.\\-\\_]+)', function(request, response) {
        var name = request.params.name;
        console.log('GET /apps/' + name);

        models.app.findOne({ // multiple results could be found, just return one of them
            where: { app_name: name },
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
        .then( app => {
            if (!app)
                throw new Error();
            response.json(app);
        })
        .catch((err) => {
            console.error("Error: App not found");
            response.status(404).send("App not found");
        });
    });

    app.post('/apps/runs', function(request, response) {
        console.log('POST /apps/runs');
        console.log(request.body);

        var app_id = request.body.app_id;
        var params = request.body.params;

        if (!app_id || !params) {
            console.log('Error: missing required field');
            response.json({});
            return;
        }

        validateAgaveToken(request)
        .then( (profile) =>
            models.user.findOne({
                where: { user_name: profile.username }
            })
        )
        .then( (user) =>
            models.app_run.create({
                app_id: app_id,
                user_id: user.user_id,
                app_ran_at: sequelize.fn('NOW'),
                params: params
            })
        )
        .then( app_run => response.json(app_run) )
        .catch((err) => {
            console.error("Error: ", err);
            response.status(500).send(err);
        });
    });

    app.post('/authenticate', function(request, response) { // three-legged oauth
        console.log('POST /authenticate');
        console.log(request.body);

        var provider_name = request.body.provider;
        var code = request.body.code;
        var user_id = request.body.user_id;
        var redirect_uri = request.body.redirect_uri;

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
                response.json(parsedBody);
            })
            .catch((err) => {
                console.error("Error: ", err);
                response.status(500).send(err);
            });
        })
        .catch(function (err) {
            console.error(err.message);
            response.status(401).send("Authentication failed");
        });
    });

    app.get('/assemblies', function(request, response) {
        console.log('GET /assemblies');

        models.assembly.findAll({
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/assemblies/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /assemblies/' + id);

        models.assembly.findOne({
            where: { assembly_id: id },
            include: [
                { model: models.project
                , attributes : [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( assembly => {
            if (!assembly)
                throw new Error();
            response.json(assembly)
        })
        .catch((err) => {
            console.error("Error: Assembly not found");
            response.status(404).send("Assembly not found");
        });
    });

    app.get('/combined_assemblies', function(request, response) {
        console.log('GET /combined_assemblies');

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
        .then( data => response.json(data) );
    });

    app.get('/combined_assemblies/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /combined_assemblies/' + id);

        models.combined_assembly.findOne({
            where: { combined_assembly_id: id },
            include: [
                { model: models.project
                , attributes : [ 'project_id', 'project_name' ]
                },
                { model: models.sample
                , attributes: [ 'sample_id', 'sample_name' ]
                }
            ]
        })
        .then( assembly => {
            if (!assembly)
                throw new Error();
            response.json(assembly);
        })
        .catch((err) => {
            console.error("Error: Combined Assembly not found");
            response.status(404).send("Combined Assembly not found");
        });
    });

    app.post('/contact', function(request, response) {
        console.log('POST /contact');
        console.log(request.body);

        var name = request.body.name || "Unknown";
        var email = request.body.email || "Unknown";
        var message = request.body.message || "";

        sendmail({
            from: email,
            to: config.supportEmail,
            subject: 'Support Request',
            html: message,
        }, function(err, reply) {
            console.log(err && err.stack);
            console.dir(reply);
        });

        response.json({
            status: "success"
        })
    });

    app.get('/domains', function(request, response) {
        console.log('GET /domains');

        models.domain.findAll({
            include: [
                { model: models.project 
                , attributes: [ 'project_id', 'project_name' ]
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/domains/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /domains/' + id);

        models.domain.findOne({
            where: { domain_id: id },
            include: [
                { model: models.project 
                , attributes : [ 'project_id', 'project_name' ]
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
        .then( domain => {
            if (!domain)
                throw new Error();
            response.json(domain);
        })
        .catch((err) => {
            console.error("Error: Domain not found");
            response.status(404).send("Domain not found");
        });
    });

    app.get('/investigators/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /investigators/' + id);

        models.investigator.findOne({
            where: { investigator_id: id },
            include: [
                { model: models.project
                , through: { attributes: [] } // remove connector table from output
                },
                { model: models.sample
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
        .then( investigator => {
            if (!investigator)
                throw new Error();
            response.json(investigator);
        })
        .catch((err) => {
            console.error("Error: Investigator not found");
            response.status(404).send("Investigator not found");
        });
    });

    app.get('/investigators', function(request, response) {
        console.log('GET /investigators');

        models.investigator.findAll()
        .then( investigator => response.json(investigator) );
    });

    app.post('/login', function(request, response) {
        console.log('POST /login');

        // TODO validate token

        var user_name = request.body.user_name; // TODO get username from token
        if (!user_name) {
            console.log("Error: missing required field");
            response.status(400).send("Error: missing required field");
            return;
        }
        console.log('username = ' + user_name);

        models.user.findOrCreate({
            where: { user_name: user_name }
        })
        .spread( (user, created) => {
            models.login.create({
                user_id: user.user_id,
                login_date: sequelize.fn('NOW'),
            })
            .then( login => response.json({ // Respond w/o login_date: this is a workaround to prevent Elm decoder from failing on login_date = "fn":"NOW"
                login_id: login.login_id,
                user: user
            }) );
        });
    });

    app.get('/project_groups', function(request, response) {
        console.log('GET /project_groups');

        models.project_group.findAll({
            include: [
                { model: models.project 
                , attributes: [ 'project_id', 'project_name' ]
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
        .then( data => response.json(data) );
    })

    app.get('/project_groups/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /project_groups/' + id);

        models.project_group.findOne({
            where: { project_group_id: id },
            include: [
                { model: models.project 
                , attributes: [ 'project_id', 'project_name' ]
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
        .then( group => {
            if (!group)
                throw new Error();
            response.json(group);
        })
        .catch((err) => {
            console.error("Error: Project Group not found");
            response.status(404).send("Project Group not found");
        });
    });

    app.get('/projects/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /projects/' + id);

        Promise.all([
            models.project.findOne({
                where: { project_id: id },
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
                    { model: models.sample
                    , attributes: ['sample_id', 'sample_name', 'sample_type']
                    },
                    { model: models.project_group
                    , attributes: [ 'project_group_id', 'group_name' ]
                    },
                    { model: models.user
                    , attributes: ['user_id', 'user_name']
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            }),

            models.assembly.count({
                where: { project_id: id },
            }),

            models.combined_assembly.count({
                where: { project_id: id },
            }),
        ])
        .then( results => {
            var project = results[0];
            project.dataValues.assembly_count = results[1];
            project.dataValues.combined_assembly_count = results[2];
            response.json(project);
        })
        .catch((err) => {
            console.error("Error: Project not found");
            response.status(404).send("Project not found");
        });
    });

    app.get('/projects/:id(\\d+)/assemblies', function (request, response) {
        var id = request.params.id;
        console.log('GET /projects/' + id + '/assemblies');

        models.assembly.findAll({
            where: { project_id: id },
            attributes: [ 'assembly_id', 'assembly_name' ]
        })
        .then( data => {
            response.json(data);
        })
        .catch((err) => {
            console.error("Error: Project not found");
            response.status(404).send("Project not found");
        });
    });

    app.get('/projects/:id(\\d+)/combined_assemblies', function (request, response) {
        var id = request.params.id;
        console.log('GET /projects/' + id + '/combined_assemblies');

        models.combined_assembly.findAll({
            where: { project_id: id },
            attributes: [ 'combined_assembly_id', 'assembly_name' ]
        })
        .then( data => {
            response.json(data);
        })
        .catch((err) => {
            console.error("Error: Project not found");
            response.status(404).send("Project not found");
        });
    });

    app.get('/projects', function(request, response) {
        console.log('GET /projects');

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
                { model: models.user
                , attributes: ['user_id', 'user_name']
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
        .then( project => response.json(project) );
    });

    app.put('/projects', function(request, response) {
        console.log('PUT /projects');

        //TODO validate user token

        var project_name = request.body.project_name;
        if (!project_name) {
            console.log("Error: missing required field");
            response.status(400).send("Error: missing required field");
            return;
        }
        console.log('project_name = ' + project_name);

        models.project.create({
            project_name: project_name,
            project_code: "__"+project_name,
            pi: "",
            institution: "",
            project_type: "",
            url: "",
            read_file: "",
            meta_file: "",
            assembly_file: "",
            peptide_file: "",
            email: "",
            read_pep_file: "",
            nt_file: "",
            private: 1
        })
        .then( project => response.json(project) )
        .catch( err => {
            console.error("Error: cannot create project", err);
            response.status(404).send("Cannot create project");
        });
    });

    app.get('/pubchase', function(request, response) {
        console.log('GET /pubchase');

        models.pubchase.findAll()
        .then( data => response.json(data) );
    });

    app.get('/publications', function(request, response) {
        console.log('GET /publications');

        models.publication.findAll({
            attributes: [ 'publication_id', 'title', 'author' ],
            include: [
                { model: models.project 
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/publications/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /publications/' + id);

        models.publication.findOne({
            where: { publication_id: id },
            include: [
                { model: models.project },
                { model: models.project_file
                , attributes: [ 'project_file_id', 'project_id', 'file', 'description' ]
                , include: [ { model: models.project_file_type } ]
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
        .then( data => {
            if (!data)
                throw new Error();
            response.json(data);
        })
        .catch((err) => {
            console.error("Error: Publication not found");
            response.status(404).send("Publication not found");
        });
    });

    app.get('/search/:query', function (request, response) {
        var query = request.params.query;
        console.log("GET /search/" + query);

        getSearchResults(query)
        .then( data => response.json(data) );
    });

    app.get('/search_params', function (request, response) {
        console.log("GET /search_params");
        mongo()
        .then((db)   => getSampleKeys(db))
        .then((data) => response.json(data))
        .catch((err) => response.status(500).send(err));
    });

    app.post('/search_param_values', jsonParser, function (request, response) {
      var param = request.body.param;
      var query = request.body.query;
      console.log("POST /search_params_values " + param);

      mongo()
        .then(db =>
          Promise.all([getSampleKeys(db, param), getMetaParamValues(db, param, query)]))
          .then(filterMetaParamValues)
          .then(data => response.json({[param]: data}))
          .catch(err => response.status(500).send("Error: " + JSON.stringify(err)));
    });

    app.get('/samples/:id(\\d+)', function (request, response) {
        var id = request.params.id;
        console.log('GET /samples/' + id);

        Promise.all([
            models.sample.findOne({
                where: { sample_id: id },
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
                where: { sample_id: id },
            }),

            models.uproc_pfam_result.count({
                where: { sample_id: id },
            }),

            models.sample_to_centrifuge.count({
                where: { sample_id: id }
            })
        ])
        .then( results => {
            var sample = results[0];
            sample.dataValues.protein_count = results[1] + results[2];
            sample.dataValues.centrifuge_count = results[3];
            response.json(sample);
        })
        .catch((err) => {
            console.error("Error: Sample not found");
            response.status(404).send("Sample not found");
        });
    });

    app.get('/samples/:id(\\d+)/proteins', function (request, response) {
        var id = request.params.id;
        console.log('GET /samples/' + id + '/proteins');

        Promise.all([
            models.uproc_pfam_result.findAll({
                where: { sample_id: id },
                include: [{
                    model: models.pfam_annotation,
                    attributes: [ 'accession', 'identifier', 'name', 'description' ]
                }]
            }),

            models.uproc_kegg_result.findAll({
                where: { sample_id: id },
                include: [{
                    model: models.kegg_annotation,
                    attributes: [ 'name', 'definition', 'pathway', 'module' ]
                }]
            })
        ])
        .then( results => {
            response.json({
                pfam: results[0],
                kegg: results[1]
            });
        })
        .catch((err) => {
            console.error("Error: Sample not found");
            response.status(404).send("Sample not found");
        });
    });

    app.get('/samples/:id(\\d+)/centrifuge_results', function (request, response) {
        var id = request.params.id;
        console.log('GET /samples/' + id + '/centrifuge_results');

        models.sample_to_centrifuge.findAll({
            where: { sample_id: id },
            attributes: [ 'sample_to_centrifuge_id', 'num_reads', 'num_unique_reads', 'abundance' ],
            include: [{
                model: models.centrifuge,
            }]
        })
        .then( results => response.json(results) )
        .catch((err) => {
            console.error("Error: Sample not found");
            response.status(404).send("Sample not found");
        });
    });

    app.get('/samples', function(request, response) {
        console.log('GET /samples', request.query);

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

        if (typeof request.query.id !== 'undefined') {
            var ids = request.query.id.split(',');
            params.where = { sample_id: { in: ids } };
        }

        models.sample.findAll(params)
        .then( sample => response.json(sample) )
        .catch((err) => {
            console.error("Error: Sample not found");
            response.status(404).send("Sample not found");
        });
    });

    app.put('/samples', function(request, response) {
        console.log('PUT /samples');

        //TODO check permissions on parent project

        var sample_name = request.body.sample_name;
        var project_id = request.body.project_id;
        if (!sample_name || !project_id) {
            console.log("Error: missing required field");
            response.status(400).send("Error: missing required field");
            return;
        }
        console.log('sample_name = ' + sample_name);
        console.log('project_id = ' + project_id);

        validateAgaveToken(request)
        .then( profile =>
            models.user.findOne({
                where: { user_name: profile.username }
            })
        )
        .then( user =>
            models.sample.create({
                sample_name: sample_name,
                sample_code: "__"+sample_name,
                project_id: project_id,
                private: 1,
                sample_to_users: [
                    { user_id : user.user_id
                    , permission: 1
                    }
                ]
            },
            { include: [ models.sample_to_user ]
            })
        )
        .then( sample => {
            return models.sample.findOne({
                where: { sample_id: sample.sample_id },
                include: [
                    { model: models.project }
                ]
            })
        })
        .then( sample => response.json(sample) )
        .catch( err => {
            console.error("Error: cannot create sample", err);
            response.status(404).send("Cannot create sample");
        });
    });

    app.post('/samples/:id(\\d+)', function (request, response) {
        var id = request.params.id;
        console.log('GET /samples/' + id);

        // TODO check permissions on sample

        var sample_name = request.body.sample_name;
        var sample_code = request.body.sample_code;
        var sample_type = request.body.sample_type;
        console.log('sample_name = ' + sample_name);
        console.log('sample_code = ' + sample_code);
        console.log('sample_type = ' + sample_type);

        models.sample.update(
            { sample_name: sample_name,
              sample_acc: sample_code,
              sample_type: sample_type
            },
            { where: { sample_id: id } }
        )
        .then( result =>
            models.sample.findOne({
                where: { sample_id: id },
                include: [
                    { model: models.project },
                ]
            })
        )
        .then( sample => response.json(sample) )
        .catch((err) => {
            console.error("Error: " + err);
            response.status(404).send(err);
        });
    });

    app.put('/samples/:sample_id(\\d+)/attributes', function(request, response) {
        var sample_id = request.params.sample_id;
        console.log('PUT /samples/' + sample_id + '/attributes');

        var attr_type = request.body.attr_type;
        var attr_aliases = request.body.attr_aliases;
        var attr_value = request.body.attr_value;
        if (!sample_id || !attr_type || !attr_value) {
            console.log("Error: missing required field");
            response.status(400).send("Error: missing required field");
            return;
        }
        console.log('attr_type = ' + attr_type);
        console.log('attr_aliases = ' + attr_aliases);
        console.log('attr_value = ' + attr_value);

        validateAgaveToken(request)
        .then( profile =>
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
        )
        .then( user => {
            if (user.samples && user.samples.length > 0) {
                return user.samples[0];
            }
            else if (user.projects && user.projects.length > 0 && user.projects[0].samples && user.projects[0].samples.length > 0) {
                return user.projects[0].samples[0];
            }
            else {
                console.log("Error: permission denied");
                response.status(403).send("Error: permission denied");
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
        .then( sample => response.json(sample) )
        .catch( err => {
            console.error("Error: cannot create sample attribute", err);
            response.status(404).send("Cannot create sample attribute");
        });
    });

    app.post('/samples/:sample_id(\\d+)/attributes/:attr_id(\\d+)', function(request, response) {
        var sample_id = request.params.sample_id;
        var attr_id = request.params.attr_id;
        console.log('PUT /samples/' + sample_id + '/attributes/' + attr_id);

        var attr_type = request.body.attr_type;
        var attr_aliases = request.body.attr_aliases;
        var attr_value = request.body.attr_value;
        if (!sample_id || !attr_id || !attr_type || !attr_value) {
            console.log("Error: missing required field");
            response.status(400).send("Error: missing required field");
            return;
        }
        console.log('attr_type = ' + attr_type);
        console.log('attr_aliases = ' + attr_aliases);
        console.log('attr_value = ' + attr_value);

        validateAgaveToken(request)
        .then( profile =>
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
        )
        .then( user => {
            if (user.samples && user.samples.length > 0) {
                return user.samples[0];
            }
            else if (user.projects && user.projects.length > 0 && user.projects[0].samples && user.projects[0].samples.length > 0) {
                return user.projects[0].samples[0];
            }
            else {
                console.log("Error: permission denied");
                response.status(403).send("Error: permission denied");
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
        .then( sample => response.json(sample) )
        .catch( err => {
            console.error("Error: cannot update sample attribute", err);
            response.status(404).send("Cannot update sample attribute");
        });
    });

    app.delete('/samples/:sample_id(\\d+)/attributes/:attr_id(\\d+)', function (request, response) {
        var sample_id = request.params.sample_id;
        var attr_id = request.params.attr_id;
        console.log('DELETE /samples/' + sample_id + '/attributes/' + attr_id);

        //TODO check token && permissions

        models.sample_attr.destroy({
            where: { sample_attr_id: attr_id }
        })
        .then( () => {
            return models.sample.findOne({
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
        })
        .then( sample => response.json(sample) )
        .catch( err => {
            console.error("Error: Sample attribute not found");
            response.status(404).send("Sample attribute not found");
        });
    });

    app.get('/samples/files', function(request, response) {
        console.log('GET /samples/files', request.query); // query is comma-separated list of sample IDs

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

        if (typeof request.query.id !== 'undefined') {
            var ids = request.query.id.split(',');
            params.where = { sample_id: { in: ids } };
        }

        models.sample_file.findAll(params)
        .then( sample => response.json(sample) )
        .catch((err) => {
            console.error("Error: Sample not found");
            response.status(404).send("Sample not found");
        });
    });

    app.put('/samples/:sample_id/files', function(request, response) {
        var sample_id = request.params.sample_id;
        console.log('PUT /samples/' + sample_id + '/files');

        //TODO check permissions on parent project/sample

        var files = request.body.files;
        if (!files) {
            console.log("Error: missing required field");
            response.status(400).send("Error: missing required field");
            return;
        }
        console.log('files = ' + files);

        validateAgaveToken(request)
        .then( profile =>
            models.user.findOne({
                where: { user_name: profile.username }
            })
        )
        .then( () => {
            return Promise.all(
                files.map( file =>
                    models.sample_file.findOrCreate({
                        where: {
                            sample_id: sample_id,
                            sample_file_type_id: 1,
                            file
                        }
                    })
                )
            );
        })
        .then( () => {
            return models.sample.findOne({
                where: { sample_id: sample_id },
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
        .then( sample => response.json(sample) )
        .catch( err => {
            console.error("Error: cannot create sample", err);
            response.status(404).send("Cannot create sample");
        });
    });

    app.delete('/samples/:sample_id(\\d+)/files/:file_id(\\d+)', function (request, response) {
        var sample_id = request.params.sample_id;
        var file_id = request.params.file_id;
        console.log('DELETE /samples/' + sample_id + '/files/' + file_id);

        //TODO check token && permissions

        models.sample_file.destroy({
            where: { sample_file_id: file_id }
        })
        .then( () => {
            return models.sample.findOne({
                where: { sample_id: sample_id },
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
        .then( sample => response.json(sample) )
        .catch( err => {
            console.error("Error: Sample file not found");
            response.status(404).send("Sample file not found");
        });
    });

    app.post('/samples/search', jsonParser, function (request, response) {
        console.log("POST /samples/search");
        mongo()
        .then((db)   => getMetaSearchResults(db, request.body))
        .then((data) => response.json(data))
        .catch((err) => response.status(500).send("Err: " + err));
    });

    app.get('/samples/taxonomy_search/:query', function (request, response) {
        var query = request.params.query;
        console.log("GET /samples/taxonomy_search/" + query);

        models.centrifuge.findAll({
            where: sequelize.or(
                { tax_id: query },
                { name: { $like: '%'+query+'%' } }
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
        .then( results => response.json(results) )
        .catch((err) => response.status(500).send("Err: " + err));
    });

    app.get('/samples/protein_search/:db/:query', function (request, response) {
        var db = request.params.db.toUpperCase();
        var query = request.params.query.toUpperCase();
        console.log("GET /samples/protein_search/" + db + "/" + query);

        if (db == "PFAM") {
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
            .then( results => response.json(results) );
        }
        else if (db == "KEGG") {
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
            .then( results => response.json(results) );
        }
        else {
            response.json([]);
        }
    });

    app.get('/users', function(request, response) {
        console.log('GET /users');

        models.user.findAll()
        .then( data => response.json(data) );
    });

    app.get('/users/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('GET /users/' + id);

        models.user.findOne({
            where: { user_id: id },
            include: [
                { model: models.project },
                { model: models.sample }
            ]
        })
        .then( data => {
            if (!data)
                throw new Error();
            response.json(data);
        })
        .catch((err) => {
            console.error("Error: User not found");
            response.status(404).send("User not found");
        });
    });

    app.get('/users/:name([\\w\\.\\-\\_]+)', function(request, response) {
        var name = request.params.name;
        console.log('GET /users/' + name);

        models.user.findOne({
            where: { user_name: name }
        })
        .then( data => {
            if (!data)
                throw new Error();
            response.json(data);
        })
        .catch((err) => {
            console.error("Error: User not found");
            response.status(404).send("User not found");
        });
    });

    app.get('/', function(request, response) {
        var routes = app._router.stack        // registered routes
                     .filter(r => r.route)    // take out all the middleware
                     .map(r => r.route.path)
        response.json({ "routes": routes });
    });

    // catch-all function
    app.get('*', function(request, response){
        response.status(404).send("Unknown route: " + request.path);
    });
};

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

function validateAgaveToken(request) {
    return new Promise((resolve, reject) => {
        var token;
        if (!request.headers || !request.headers.authorization) {
            console.log('Error: Authorizaiton token missing: headers = ', request.headers);
            reject(new Error('Authorization token missing'));
        }
        token = request.headers.authorization;
        console.log("token:", token);

        const profileRequest = https.request(
            {   method: 'GET',
                host: 'agave.iplantc.org',
                port: 443,
                path: '/profiles/v2/me',
                headers: {
                    Authorization: token
                }
            },
            response => {
                response.setEncoding("utf8");
                if (response.statusCode < 200 || response.statusCode > 299) {
                    reject(new Error('Failed to load page, status code: ' + response.statusCode));
                }

                var body = [];
                response.on('data', (chunk) => body.push(chunk));
                response.on('end', () => {
                    body = body.join('');
                    var data = JSON.parse(body);
                    if (!data || data.status != "success")
                        reject(new Error('Status ' + data.status));
                    else {
                        data.result.token = token;
                        resolve(data.result);
                    }
                });
            }
        );
        profileRequest.on('error', (err) => reject(err));
        profileRequest.end();
    });
}
