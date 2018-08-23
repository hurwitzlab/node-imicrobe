const sequelize = require('../config/mysql').sequelize;
const models = require('../models');
const mongo = require('../config/mongo');
const express = require('express');
const router  = express.Router();
const Promise = require('promise');
const errors = require('./errors');
const toJsonOrError = require('./utils').toJsonOrError;
const requireAuth = require('./utils').requireAuth;
const errorOnNull = require('./utils').errorOnNull;
const logAdd = require('./utils').logAdd;
const permissions = require('./permissions')(sequelize);


router.get('/projects/:id(\\d+)', function(req, res, next) {
    toJsonOrError(res, next,
        permissions.checkProjectPermissions(req.params.id, req.auth.user)
        .then( () =>
            Promise.all([
                models.project.scope('withUsers', 'withGroups').findOne({
                    where: { project_id: req.params.id },
                    include: [
                        { model: models.investigator
                        , attributes: [ 'investigator_id', 'investigator_name' ]
                        , through: { attributes: [] } // remove connector table
                        },
                        { model: models.domain
                        , attributes: [ 'domain_id', 'domain_name' ]
                        , through: { attributes: [] } // remove connector table
                        },
                        { model: models.publication
                        , attributes: [ 'publication_id', 'title', 'author', 'pubmed_id', 'doi', 'pub_date' ]
                        },
                        { model: models.sample
                        , attributes: [ 'sample_id', 'sample_name', 'sample_type' ]
                        , include: [
                            { model: models.investigator
                            , attributes: [ 'investigator_id', 'investigator_name' ]
                            , through: { attributes: [] } // remove connector table
                            }
                          ]
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
        )
        .then( results => {
            var project = results[0];
            project.dataValues.available_types = results[1].map( obj => obj.DISTINCT).filter(s => (typeof s != "undefined" && s)).sort();
            project.dataValues.available_domains = results[2];
            project.dataValues.available_groups = results[3];
            project.dataValues.assembly_count = results[4];
            project.dataValues.combined_assembly_count = results[5];
            return project;
        })
    );
});

router.get('/projects', function(req, res, next) {
    var whereClause = {
            $or: {
                project_name: { $like: "%"+req.query.term+"%" },
                project_id: { $like: "%"+req.query.term+"%" }
            }
        }

    toJsonOrError(res, next,
        models.project.scope('withUsers', 'withGroups').findAll({
            //where: PROJECT_PERMISSION_CLAUSE(req.auth.user), // replaced by manual filter below to get project_group access working
            where: (req.query.term ? whereClause : {}),
            attributes: [
                'project_id', 'project_code', 'project_type', 'project_name', 'url', 'private',
                [ sequelize.literal('(SELECT COUNT(*) FROM sample WHERE sample.project_id = project.project_id)'), 'sample_count' ]
            ],
            include: [
                { model: models.investigator
                , attributes: ['investigator_id', 'investigator_name']
                , through: { attributes: [] } // remove connector table
                },
                { model: models.domain
                , attributes: [ 'domain_id', 'domain_name']
                , through: { attributes: [] } // remove connector table
                },
                { model: models.publication
                , attributes: [ 'publication_id', 'title']
                }
            ]
        })
        .then( projects => { // filter on permission
            return projects.filter(project => {
                var hasUserAccess = req.auth.user && req.auth.user.user_name && project.users && project.users.map(u => u.user_name).includes(req.auth.user.user_name);
                var hasGroupAccess = req.auth.user && req.auth.user.user_name && project.project_groups && project.project_groups.reduce((acc, g) => acc.concat(g.users), []).map(u => u.user_name).includes(req.auth.user.user_name);
                return !project.private || hasUserAccess || hasGroupAccess;
            })
        })
    );
});

router.get('/projects/:id(\\d+)/assemblies', function (req, res, next) {
    //TODO currently private samples cannot have assemblies, but in the future will need to check permissions on parent project
    toJsonOrError(res, next,
        models.assembly.findAll({
            where: { project_id: req.params.id },
            attributes: [ 'assembly_id', 'assembly_name' ]
        })
    );
});

router.get('/projects/:id(\\d+)/combined_assemblies', function (req, res, next) {
    //TODO currently private samples cannot have combined_assemblies, but in the future will need to check permissions on parent project
    toJsonOrError(res, next,
        models.combined_assembly.findAll({
            where: { project_id: req.params.id },
            attributes: [ 'combined_assembly_id', 'assembly_name' ]
        })
    );
});

router.put('/projects', function(req, res, next) {
    var project_name = req.body.project_name;

    errorOnNull(project_name);

    requireAuth(req);

    toJsonOrError(res, next,
        models.project.create({
            project_name: project_name,
            project_code: "",
            pi: "",
            institution: "",
            project_type: "Unspecified",
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
                  permission: permissions.PERMISSION_OWNER
                }
            ]
        },
        { include: [ models.project_to_user ]
        })
        .then( project =>
            logAdd(req, {
                title: "Added project '" + project_name + "'",
                type: "addProject",
                project_id: project.get().project_id
            })
            .then( () => project )
        )
    );
});

router.post('/projects/:project_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    var project_id = req.params.project_id;
    var project_name = req.body.project_name;
    var project_description = req.body.project_description;
    var project_code = req.body.project_code;
    var project_type = req.body.project_type;
    var project_institution = req.body.project_institution;
    var project_url = req.body.project_url;
    var domains = req.body.domains;
    var investigators = req.body.investigators;
    var groups = req.body.groups;

    toJsonOrError(res, next,
        permissions.requireProjectEditPermission(project_id, req.auth.user)
        .then( () =>
            logAdd(req, {
                title: "Updated project '" + project_name + "'",
                type: "updateProject",
                project_id: project_id
            })
        )
        .then( () =>
            models.project.update(
                { project_name: project_name,
                  project_code: project_code,
                  project_type: project_type,
                  description: project_description,
                  institution: project_institution,
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

router.post('/projects/:project_id(\\d+)/publish', function (req, res, next) {
    requireAuth(req);

    var project_id = req.params.project_id;
    var validate = req.body.validate; // just test whether project is ready for submission, don't actually submit

    permissions.requireProjectOwnerPermission(project_id, req.auth.user)
    .then( () =>
        validateProjectForPublication(project_id) // will throw an error if project not ready
    )
    .then( project => {
        if (validate)
            return res.send("success");
        else
            return logAdd(req, {
                title: "Submitted project '" + project.project_name + "' for publishing",
                type: "publishProject",
                project_id: project_id
            })
            .then( () =>
                models.project.update(
                    { ebi_status: "PENDING",
                      ebi_submitter_id: req.auth.user.user_id,
                    },
                    { where: { project_id: project_id } }
                )
             )
             .then( () => res.send("PENDING") );
    })
    .catch(next);
});

function validateProjectForPublication(project_id) {
    return models.project.scope('withUsers', 'withGroups').findOne({
        where: { project_id: project_id },
        include: [
            { model: models.domain },
            { model: models.investigator },
            { model: models.sample,
              include: [
                { model: models.sample_attr,
                  include: [ models.sample_attr_type ]
                },
                { model: models.sample_file,
                  include: [ models.sample_file_type ]
                }
              ]
            }
        ]
    })
    .then( project => {
        if (!project)
            throw(errors.ERR_NOT_FOUND);

        var errorList = [];

        // Check for required fields in Project
        if (!project.project_name)
            errorList.push("Missing project name field");
        if (!project.project_code)
            errorList.push("Missing project accession field");
        if (!project.project_type || project.project_type.toLowerCase() == "<not provided>")
            errorList.push("Missing project type field");
        if (!project.description)
            errorList.push("Missing project description field");
        if (!project.institution)
            errorList.push("Missing project institution field");

        // Check for at least one read file across all samples
        var readFiles = project.samples
            .reduce((acc, s) => acc.concat(s.sample_files), [])
            .filter(f => f.sample_file_type.type.toLowerCase() == "reads");
        if (!readFiles || readFiles.length == 0)
            errorList.push("No read files associated with samples");

        // Check for required fields in Samples
        project.samples.forEach(sample => {
            var attrs = {};
            sample.sample_attrs.forEach(attr => {
                var key = attr.sample_attr_type.type.toLowerCase();
                attrs[key] = attr.attr_value;
            });

            if (!attrs["taxon_id"])
                errorList.push("Missing taxon_id attribute for Sample '" + sample.sample_name + "'");
            if (!attrs["library_strategy"])
                errorList.push("Missing library_strategy attribute for Sample '" + sample.sample_name + "'");
            if (!attrs["library_source"])
                errorList.push("Missing library_source attribute for Sample '" + sample.sample_name + "'");
            if (!attrs["library_selection"])
                errorList.push("Missing library_selection attribute for Sample '" + sample.sample_name + "'");
            if (!attrs["library_layout"])
                errorList.push("Missing library_layout attribute for Sample '" + sample.sample_name + "'");
            if (!attrs["platform_type"])
                errorList.push("Missing platform_type attribute for Sample '" + sample.sample_name + "'");
            if (!attrs["platform_model"])
                errorList.push("Missing platform_model attribute for Sample '" + sample.sample_name + "'");

            // Check for at least one read file in this sample
            var readFiles = sample.sample_files.filter(f => f.sample_file_type.type.toLowerCase() == "reads");
            if (!readFiles || readFiles.length == 0)
                errorList.push("No read files associated with Sample '" + sample.sample_name + "'");
        });

        // Require that project (and associated files) have been shared with the "imicrobe" user
        // TODO automatically share files with "imicrobe"
        var userAccess =
            project.users &&
                project.users
                .map(u => u.user_name)
                .includes("imicrobe");

        var groupAccess =
            project.project_groups &&
                project.project_groups
                .reduce((acc, g) => acc.concat(g.users), [])
                .map(u => u.user_name)
                .includes("imicrobe");

        if (!userAccess && !groupAccess)
            errorList.push("Share project with 'imicrobe' user");

        // Throw error(s)
        if (errorList.length > 0)
            throw(new errors.MyError(errorList));

        return project;
    });
}

router.delete('/projects/:project_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.requireProjectOwnerPermission(req.params.project_id, req.auth.user)
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
                title: "Removed project '" + project.project_name + "'",
                type: "removeProject",
                project_id: project.project_id
            })
            .then( () => project )
        )
        .then( project => {
            return Promise.all(
                project.samples.map( sample =>
                    mongo.decrementSampleKeys(sample.sample_id)
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

router.put('/projects/:project_id(\\d+)/investigators/:investigator_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.requireProjectEditPermission(req.params.project_id, req.auth.user)
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
                title: "Added investigator " + results[1].investigator_name + " to project '" + results[0].project_name + "'",
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

router.delete('/projects/:project_id(\\d+)/investigators/:investigator_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.requireProjectEditPermission(req.params.project_id, req.auth.user)
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
                title: "Removed investigator " + results[1].investigator_name + " from project '" + results[0].project_name + "'",
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

router.put('/projects/:project_id(\\d+)/users/:user_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    errorOnNull(req.body.permission);

    toJsonOrError(res, next,
        permissions.requireProjectEditPermission(req.params.project_id, req.auth.user)
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
                title: "Added user " + (results[1].first_name + " " + results[1].last_name) + " (" + results[1].user_name + ") to project '" + results[0].project_name + "'",
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
                permission: permissions.PERMISSION_CODES[req.body.permission]
            })
        )
        .then( () =>
            permissions.updateProjectFilePermissions(req.params.project_id, req.params.user_id, req.headers.authorization, req.body.permission)
        )
        .then( () =>
            models.project.scope('withUsers').findOne({
                where: { project_id: req.params.project_id }
            })
        )
    );
});

router.delete('/projects/:project_id(\\d+)/users/:user_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.requireProjectEditPermission(req.params.project_id, req.auth.user)
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
                title: "Removed user " + (results[1].first_name + " " + results[1].last_name) + " (" + results[1].user_name + ") from project '" + results[0].project_name + "'",
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

module.exports = router;