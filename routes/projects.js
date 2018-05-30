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
                        , include: [ models.sample_file ]
                        },
                        { model: models.project_group
                        , attributes: [ 'project_group_id', 'group_name',
                            [ sequelize.literal('(SELECT COUNT(*) FROM project_group_to_user WHERE `project_groups`.`project_group_id` = project_group_id)'), 'user_count' ]
                          ]
                        , through: { attributes: [] } // remove connector table from output
                        },
                        { model: models.user
                        , attributes: [ 'user_id', 'user_name', 'first_name', 'last_name', permissions.PROJECT_PERMISSION_ATTR ]
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
                throw(errors.ERR_NOT_FOUND);

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
                , attributes: ['user_id', 'user_name', 'first_name', 'last_name', permissions.PROJECT_PERMISSION_ATTR ]
                , through: { attributes: [] } // remove connector table from output
                },
                { model: models.project_group
                , attributes: ['project_group_id', 'group_name' ]
                , through: { attributes: [] } // remove connector table from output
                , include: [
                    { model: models.user
                    , attributes: ['user_id', 'user_name', 'first_name', 'last_name', permissions.PROJECT_GROUP_PERMISSION_ATTR2 ]
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

router.post('/projects/:project_id(\\d+)', function (req, res, next) {
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
        permissions.requireProjectEditPermission(project_id, req.auth.user)
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

router.delete('/projects/:project_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.requireProjectEditPermission(req.params.project_id, req.auth.user)
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

router.put('/projects/:project_id(\\d+)/users/:user_id(\\d+)', function (req, res, next) {
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
                permission: permissions.PERMISSION_CODES[req.body.permission]
            })
        )
        .then( permissions.updateProjectFilePermissions(req.params.project_id, req.params.user_id, req.headers.authorization, req.body.permission) )
        .then( () =>
            models.project.findOne({
                where: { project_id: req.params.project_id },
                include: [
                    { model: models.user
                    , attributes: ['user_id', 'user_name', 'first_name', 'last_name', permissions.PROJECT_PERMISSION_ATTR]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
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

module.exports = router;