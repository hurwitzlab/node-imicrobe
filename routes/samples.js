const sequelize = require('../config/mysql').sequelize;
const models = require('../models');
const mongo = require('../config/mongo');
const express = require('express');
const router  = express.Router();
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const Promise = require('promise');
const errors = require('./errors');
const toJsonOrError = require('./utils').toJsonOrError;
const requireAuth = require('./utils').requireAuth;
const errorOnNull = require('./utils').errorOnNull;
const logAdd = require('./utils').logAdd;
const permissions = require('./permissions')(sequelize);

router.get('/samples/search_params', function (req, res, next) {
    mongo.mongo()
    .then((db)   => getSampleKeys(db))
    .then((data) => res.json(data))
    .catch((err) => res.status(500).send(err));
});

router.post('/samples/search_param_values', jsonParser, function (req, res, next) {
  var param = req.body.param;
  var query = req.body.query;

  mongo.mongo()
    .then(db =>
      Promise.all([getSampleKeys(db, param), getMetaParamValues(db, param, query)]))
      .then(filterMetaParamValues)
      .then(data => res.json({[param]: data}))
      .catch(err => res.status(500).send("Error: " + JSON.stringify(err)));
});

router.get('/samples/:id(\\d+)', function (req, res, next) {
    toJsonOrError(res, next,
        permissions.checkSamplePermissions(req.params.id, req.auth.user)
        .then( () => {
            return Promise.all([
                models.sample.findOne({
                    where: { sample_id: req.params.id },
                    include: [
                        { model: models.project
                        , include: [
                                { model: models.user
                                , attributes: ['user_id', 'user_name', 'first_name', 'last_name', permissions.SAMPLE_PERMISSION_ATTR]
                                , through: { attributes: [] } // remove connector table from output
                                },
                                { model: models.project_group
                                , attributes: [ 'project_group_id', 'group_name' ]
                                , through: { attributes: [] } // remove connector table from output
                                , include: [
                                    { model: models.user
                                    , attributes: ['user_id', 'user_name', permissions.PROJECT_GROUP_PERMISSION_ATTR ]
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

router.get('/samples/:id(\\d+)/proteins', function (req, res, next) {
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

router.get('/samples/:id(\\d+)/centrifuge_results', function (req, res, next) {
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

router.get('/samples', function(req, res, next) {
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
                , attributes: ['user_id', 'user_name', 'first_name', 'last_name', permissions.SAMPLE_PERMISSION_ATTR]
                , through: { attributes: [] } // remove connector table from output
                },
                { model: models.project_group
                , attributes: ['project_group_id', 'group_name' ]
                , through: { attributes: [] } // remove connector table from output
                , include: [
                    { model: models.user
                    , attributes: ['user_id', 'user_name', 'first_name', 'last_name', permissions.PROJECT_GROUP_PERMISSION_ATTR ]
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

router.put('/samples', function(req, res, next) {
    requireAuth(req);

    var sample_name = req.body.sample_name;
    var project_id = req.body.project_id;

    errorOnNull(sample_name, project_id);

    toJsonOrError(res, next,
        permissions.requireProjectEditPermission(project_id, req.auth.user)
        .then( () =>
            models.sample.create({
                sample_name: sample_name,
                sample_code: "__"+sample_name,
                project_id: project_id
            })
        )
        .then( sample =>
            logAdd(req, {
                title: "Added sample '" + sample_name + "'",
                type: "addSample",
                sample_id: sample.sample_id
            })
            .then( () => { return sample })
        )
        .then( sample =>
            mongo.mongo()
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

router.post('/samples/:sample_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.checkSamplePermissions(req.params.sample_id, req.auth.user)
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
                    title: "Updated sample '" + sample.sample_name + "'",
                    type: "updateSample",
                    sample_id: sample.sample_id
                })
                .then( () => sample )
            )
        )
    );
});

router.delete('/samples/:sample_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.checkSamplePermissions(req.params.sample_id, req.auth.user)
        .then( () =>
            models.sample.findOne({
                where: { sample_id: req.params.sample_id },
            })
        )
        .then( sample =>
            permissions.requireProjectOwnerPermission(sample.project_id, req.auth.user)
            .then( () => sample )
        )
        .then( sample =>
            logAdd(req, {
                title: "Removed sample '" + sample.sample_name + "'",
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
            mongo.decrementSampleKeys(req.params.sample_id)
        )
        // Remove sample from Mongo DB
        .then( () =>
            mongo.mongo()
            .then( db =>
                db.collection('sample').remove({ "specimen__sample_id": 1*req.params.sample_id })
            )
        )
    );
});

router.put('/samples/:sample_id(\\d+)/attributes', function(req, res, next) {
    requireAuth(req);

    var sample_id = req.params.sample_id;
    var attr_type = req.body.attr_type;
    var attr_aliases = req.body.attr_aliases;
    var attr_value = req.body.attr_value;

    errorOnNull(sample_id, attr_type, attr_value);

    var aliases = (attr_aliases ? attr_aliases.split(",").map(s => s.trim()) : []);

    toJsonOrError(res, next,
        permissions.checkSamplePermissions(sample_id, req.auth.user)
        .then( () =>
            logAdd(req, {
                title: "Added sample attribute " + attr_type + " = " + attr_value,
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
            mongo.mongo()
            .then( db => {
                var key = "specimen__" + attr_type;
                var obj = {};
                obj[key] = attr_value;

                db.collection('sample').updateOne(
                    { "specimen__sample_id": 1*sample_id },
                    { $set: obj }
                );

                return mongo.incrementSampleKey(db, key, attr_value);
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

router.post('/samples/:sample_id(\\d+)/attributes/:attr_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    var sample_id = req.params.sample_id;
    var attr_id = req.params.attr_id;
    var attr_type = req.body.attr_type;
    var attr_aliases = req.body.attr_aliases;
    var attr_value = req.body.attr_value;

    errorOnNull(sample_id, attr_id, attr_type, attr_value);

    var aliases = (attr_aliases ? attr_aliases.split(",").map(s => s.trim()) : []);

    toJsonOrError(res, next,
        permissions.checkSamplePermissions(sample_id, req.auth.user)
        .then( () =>
            logAdd(req, {
                title: "Updated sample attribute " + attr_type + " = " + attr_value,
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
            mongo.mongo()
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

router.delete('/samples/:sample_id(\\d+)/attributes/:attr_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    //TODO delete unused sample_attr_type_alias entries

    toJsonOrError(res, next,
        permissions.checkSamplePermissions(req.params.sample_id, req.auth.user)
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
                title: "Removed sample attribute '" + sample_attr.sample_attr_type.type + "'",
                type: "removeSampleAttribute",
                sample_id: req.params.sample_id,
                attr_id: req.body.attr_id
            })
            .then( () =>
                mongo.mongo()
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

router.get('/samples/files', function(req, res, next) {
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

router.put('/samples/:sample_id/files', function(req, res, next) {
    requireAuth(req);

    var files = req.body.files;
    console.log("files: ", files);

    errorOnNull(files);

    toJsonOrError(res, next,
        permissions.checkSamplePermissions(req.params.sample_id, req.auth.user)
        .then( () =>
            models.sample.findOne({
                where: { sample_id: req.params.sample_id }
            })
        )
        .then( sample =>
            logAdd(req, {
                title: "Added " + files.length + " files to sample '" + sample.sample_name + "'",
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
        .then( () =>
            permissions.updateSampleFilePermissions(req.params.sample_id, req.headers.authorization, files)
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

router.post('/samples/:sample_id(\\d+)/files/:file_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    var sample_id = req.params.sample_id;
    var sample_file_id = req.params.file_id;
    var type_id = req.body.type_id;

    errorOnNull(sample_id, type_id);

    toJsonOrError(res, next,
        permissions.checkSamplePermissions(sample_id, req.auth.user)
        .then( () =>
            models.sample.findOne({
                where: { sample_id: req.params.sample_id }
            })
        )
        .then( sample =>
            logAdd(req, {
                title: "Updated file " + sample_file_id + " for sample '" + sample.sample_name + "'",
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

router.delete('/samples/:sample_id(\\d+)/files/:file_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.checkSamplePermissions(req.params.sample_id, req.auth.user)
        .then( () =>
            models.sample.findOne({
                where: { sample_id: req.params.sample_id }
            })
        )
        .then( sample =>
            logAdd(req, {
                title: "Removed file " + req.params.file_id + " from sample '" + sample.sample_name + "'",
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

router.post('/samples/search', jsonParser, function (req, res, next) {
    console.log(req.body);

    mongo.mongo()
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
                        , attributes: ['user_id', 'user_name', 'first_name', 'last_name', permissions.SAMPLE_PERMISSION_ATTR]
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

router.get('/samples/taxonomy_search/:query', function (req, res, next) {
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

router.get('/samples/protein_search/:db/:query', function (req, res, next) {
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

module.exports = router;