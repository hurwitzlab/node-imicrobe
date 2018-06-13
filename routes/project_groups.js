const sequelize = require('../config/mysql').sequelize;
const models = require('../models');
const express = require('express');
const router  = express.Router();
const Promise = require('promise');
const errors = require('./errors');
const EMPTY_PROMISE = require('./utils').EMPTY_PROMISE;
const toJsonOrError = require('./utils').toJsonOrError;
const requireAuth = require('./utils').requireAuth;
const errorOnNull = require('./utils').errorOnNull;
const logAdd = require('./utils').logAdd;
const permissions = require('./permissions')(sequelize);

router.get('/project_groups', function(req, res, next) {
    toJsonOrError(res, next,
        models.project_group.scope('withUsers').findAll({
            where: (req.query.term ? { group_name: { $like: "%"+req.query.term+"%" } } : {}),
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                , through: { attributes: [] } // remove connector table
                }
            ]
        })
        .then( groups => { // filter on permission
            return groups.filter(group => {
                var hasAccess =
                    req.auth.user && req.auth.user.user_name &&
                    group.users.map(u => u.user_name).includes(req.auth.user.user_name);
                return !group.private || hasAccess;
            })
        })
    );
})

router.get('/project_groups/:id(\\d+)', function(req, res, next) {
    toJsonOrError(res, next,
        permissions.checkProjectGroupPermissions(req.params.id, req.auth.user)
        .then( () =>
            models.project_group.scope('withUsers').findOne({
                where: { project_group_id: req.params.id },
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table
                    }
                ]
            })
        )
    );
});

router.put('/project_groups', function(req, res, next) {
    var group_name = req.body.group_name;

    errorOnNull(group_name);

    requireAuth(req);

    toJsonOrError(res, next,
        models.project_group.create({
            group_name: group_name,
            project_group_to_users: [
                { user_id: req.auth.user.user_id,
                  permission: permissions.PERMISSION_OWNER
                }
            ]
        },
        { include: [ models.project_group_to_user ]
        })
        .then( group =>
            logAdd(req, {
                title: "Added project group '" + group_name + "'",
                type: "addProjectGroup",
                project_group_id: group.get().project_group_id
            })
            .then( () => group )
        )
    );
});

router.post('/project_groups/:id(\\d+)', function (req, res, next) {
    requireAuth(req);

    var project_group_id = req.params.id;
    var group_name = req.body.group_name;
    var group_description = req.body.group_description;
    var group_url = req.body.group_url;

    toJsonOrError(res, next,
        permissions.requireProjectGroupEditPermission(project_group_id, req.auth.user)
        .then( () =>
            logAdd(req, {
                title: "Updated project group '" + group_name + "'",
                type: "updateProjectGroup",
                project_group_id: project_group_id
            })
        )
        .then( () =>
            models.project_group.update(
                { group_name: group_name,
                  description: group_description,
                  url: group_url
                },
                { where: { project_group_id: project_group_id } }
            )
        )
        .then( () =>
            models.project_group.scope('withUsers').findOne({
                where: { project_group_id: project_group_id },
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table
                    }
                ]
            })
        )
    );
});

router.delete('/project_groups/:id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        permissions.requireProjectGroupOwnerPermission(req.params.id, req.auth.user)
        .then( () =>
            models.project_group.findOne({
                where: { project_group_id: req.params.id }
            })
        )
        .then( group =>
            logAdd(req, {
                title: "Removed project group '" + group.group_name + "'",
                type: "removeProjectGroup",
                project_group_id: group.project_group_id
            })
        )
        .then( () =>
            models.project_group.destroy({
                where: {
                    project_group_id: req.params.id
                }
            })
        )
    );
});

// Add a Project to a Project Group (and share with the group's user list)
router.put('/project_groups/:project_group_id(\\d+)/projects/:project_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    var shareFiles = req.body.shareFiles;
    console.log(req.body);

    toJsonOrError(res, next,
        Promise.all([
            permissions.requireProjectEditPermission(req.params.project_id, req.auth.user),
            permissions.requireProjectGroupEditPermission(req.params.project_group_id, req.auth.user)
        ])
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
                title: "Added project '" + results[0].project_name + "' to group '" + results[1].group_name + "'",
                type: "addProjectToProjectGroup",
                project_id: req.params.project_id,
                project_group_id: req.params.project_group_id
            })
        )
        .then( () =>
            models.project_group.scope('withUsers').findOne({
                where: { project_group_id: req.params.project_group_id }
            })
        )
        .then( project_group => {
            if (shareFiles) {
                Promise.all(
                    project_group.users
                    .map( user => {
                        return permissions.updateProjectFilePermissions(req.params.project_id, user.user_id, req.headers.authorization, user.get().project_group_to_user.permission)
                    })
                )
            }
            else {
                return EMPTY_PROMISE;
            }
        })
        .then( () =>
            models.project_group.scope('withUsers').findOne({
                where: { project_group_id: req.params.project_group_id },
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table
                    }
                ]
            })
        )
    );
});

// Remove a Project from a Project Group (and unshare with the group's user list)
router.delete('/project_groups/:project_group_id(\\d+)/projects/:project_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        Promise.all([
            permissions.checkProjectPermissions(req.params.project_id, req.auth.user),
            permissions.checkProjectGroupPermissions(req.params.project_group_id, req.auth.user)
        ])
        // Get project and group for logging
        .then( results => {
            if (results[0] >= permissions.PERMISSION_READ_ONLY && results[1] >= permissions.PERMISSION_READ_ONLY)
                throw(errors.ERR_PERMISSION_DENIED);

            return Promise.all([
                models.project.findOne({
                    where: { project_id: req.params.project_id }
                }),
                models.project_group.findOne({
                    where: { project_group_id: req.params.project_group_id }
                })
            ])
        })
        .then( results =>
            logAdd(req, {
                title: "Removed project '" + results[0].project_name + "' from group '" + results[1].group_name + "'",
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
        .then( () =>
            models.project_group.scope('withUsers').findOne({
                where: { project_group_id: req.params.project_group_id },
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table
                    }
                ]
            })
        )
    );
});

// Add a user to a Project Group
router.put('/project_groups/:project_group_id(\\d+)/users/:user_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    var projectGroupId = req.params.project_group_id;
    var permission = req.body.permission;
    var shareFiles = req.body.shareFiles;
    console.log(req.body);

    errorOnNull(permission);

    toJsonOrError(res, next,
        permissions.requireProjectGroupEditPermission(projectGroupId, req.auth.user)
        .then( () =>
            models.project_group_to_user.destroy({ // First remove all existing connections
                where: {
                    project_group_id: projectGroupId,
                    user_id: req.params.user_id
                }
            })
        )
        .then( () =>
            models.project_group_to_user.findOrCreate({
                where: {
                    project_group_id: projectGroupId,
                    user_id: req.params.user_id,
                    permission: permissions.PERMISSION_CODES[permission]
                }
            })
        )
        // Get user and group for logging
        .then( () =>
            Promise.all([
                models.user.findOne({
                    where: { user_id: req.params.user_id }
                }),
                models.project_group.findOne({
                    where: { project_group_id: projectGroupId }
                })
            ])
        )
        .then( results =>
            logAdd(req, {
                title: "Added user '" + results[0].user_name + "' to group '" + results[1].group_name + "'",
                type: "addUserToProjectGroup",
                target_user_id: req.params.user_id,
                project_group_id: projectGroupId
            })
        )
        .then( () =>
            models.project_group.findOne({
                where: { project_group_id: projectGroupId },
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table
                    }
                ]
            })
        )
        .then( project_group => {
            if (shareFiles) {
                return Promise.all(
                    project_group.projects
                    .map( project => {
                        return permissions.updateProjectFilePermissions(project.project_id, req.params.user_id, req.headers.authorization, permission)
                    })
                )
            }
            else {
                return EMPTY_PROMISE;
            }
        })
        .then( () =>
            models.project_group.scope('withUsers').findOne({
                where: { project_group_id: projectGroupId }
            })
        )
        .then( project_group =>
            project_group.users
        )
    );
});

// Remove a user from a Project Group
router.delete('/project_groups/:project_group_id(\\d+)/users/:user_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    var projectGroupId = req.params.project_group_id;

    toJsonOrError(res, next,
        Promise.all([
            permissions.requireProjectGroupEditPermission(projectGroupId, req.auth.user)
        ])
        // Get user and group for logging
        .then( () =>
            Promise.all([
                models.user.findOne({
                    where: { user_id: req.params.user_id }
                }),
                models.project_group.findOne({
                    where: { project_group_id: projectGroupId }
                })
            ])
        )
        .then( results =>
            logAdd(req, {
                title: "Remove user '" + results[0].user_name + "' to group '" + results[1].group_name + "'",
                type: "removeUserFromProjectGroup",
                target_user_id: req.params.user_id,
                project_group_id: projectGroupId
            })
        )
        .then( () =>
            models.project_group_to_user.destroy({
                where: {
                    project_group_id: projectGroupId,
                    user_id: req.params.user_id
                }
            })
        )
        .then( () =>
            models.project_group.scope('withUsers').findOne({
                where: { project_group_id: projectGroupId }
            })
        )
        .then( project_group =>
            project_group.users
        )
    );
});

module.exports = router;