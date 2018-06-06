const sequelize = require('../config/mysql').sequelize;
const models = require('../models');
const express = require('express');
const router  = express.Router();
const Promise = require('promise');
const errors = require('./errors');
const toJsonOrError = require('./utils').toJsonOrError;
const requireAuth = require('./utils').requireAuth;
const errorOnNull = require('./utils').errorOnNull;
const logAdd = require('./utils').logAdd;
const permissions = require('./permissions')(sequelize);

router.get('/project_groups', function(req, res, next) {
    toJsonOrError(res, next,
        models.project_group.findAll({
            where: (req.query.term ? { group_name: { $like: "%"+req.query.term+"%" } } : {}),
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                , through: { attributes: [] } // remove connector table from output
                },
                { model: models.user
                , attributes: [ 'user_id', 'user_name', 'first_name', 'last_name', permissions.PROJECT_GROUP_PERMISSION_ATTR3 ]
                , through: { attributes: [] } // remove connector table from output
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
            models.project_group.findOne({
                where: { project_group_id: req.params.id },
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    },
                    { model: models.user
                    , attributes: [ 'user_id', 'user_name', 'first_name', 'last_name', permissions.PROJECT_GROUP_PERMISSION_ATTR3 ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        )
    );
});

// Add a Project to a Project Group (and share with the group's user list)
router.put('/project_groups/:project_group_id(\\d+)/projects/:project_id(\\d+)', function(req, res, next) {
    requireAuth(req);

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
            models.project_group.findOne({
                where: { project_group_id: req.params.project_group_id },
                include: [
                    { model: models.user
                    , attributes: [ 'user_id', 'user_name', permissions.PROJECT_GROUP_PERMISSION_ATTR3 ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        )
        .then( project_group =>
            Promise.all(
                project_group.users
                .map( user => {
                    return permissions.updateProjectFilePermissions(req.params.project_id, user.user_id, req.headers.authorization, user.get().permission)
                })
            )
        )
        .then( () =>
            models.project.findOne({
                where: { project_id: req.params.project_id },
                include: [
                    { model: models.project_group
                    , attributes: [ 'project_group_id', 'group_name',
                        [ sequelize.literal('(SELECT COUNT(*) FROM project_group_to_user AS pgtou WHERE pgtou.project_group_id = project_group.project_group_id)'), 'user_count' ]
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
router.delete('/project_groups/:project_group_id(\\d+)/projects/:project_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        Promise.all([
            permissions.requireProjectEditPermission(req.params.project_id, req.auth.user),
            permissions.requireProjectGroupEditPermission(req.params.project_group_id, req.auth.user)
        ])
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
        .then( () => {
            return "success";
        })
    );
});

// Add a user to a Project Group
router.put('/project_groups/:project_group_id(\\d+)/users/:user_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    errorOnNull(req.body.permission);

    toJsonOrError(res, next,
        permissions.requireProjectGroupEditPermission(req.params.project_group_id, req.auth.user)
        .then( () =>
            models.project_group_to_user.findOrCreate({
                where: {
                    project_group_id: req.params.project_group_id,
                    user_id: req.params.user_id
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
                    where: { project_group_id: req.params.project_group_id }
                })
            ])
        )
        .then( results =>
            logAdd(req, {
                title: "Added user '" + results[0].user_name + "' to group '" + results[1].group_name + "'",
                type: "addUserToProjectGroup",
                target_user_id: req.params.user_id,
                project_group_id: req.params.project_group_id
            })
        )
        .then( () =>
            models.project_group.findOne({
                where: { project_group_id: req.params.project_group_id },
                include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    , through: { attributes: [] } // remove connector table from output
                    }
                ]
            })
        )
        .then( project_group =>
            Promise.all(
                project_group.projects
                .map( project => {
                    return permissions.updateProjectFilePermissions(project.project_id, req.params.user_id, req.headers.authorization, req.body.permission)
                })
            )
        )
        .then( () =>
            models.project_group.findOne({
                where: { project_group_id: req.params.project_group_id },
                include: [
                    { model: models.user
                    , attributes: ['user_id', 'user_name', 'first_name', 'last_name', permissions.PROJECT_PERMISSION_ATTR]
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

// Remove a user from a Project Group
router.delete('/project_groups/:project_group_id(\\d+)/users/:user_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        Promise.all([
            permissions.requireProjectEditPermission(req.params.project_id, req.auth.user),
            permissions.requireProjectGroupEditPermission(req.params.project_group_id, req.auth.user)
        ])
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
        .then( () => {
            return "success";
        })
    );
});

module.exports = router;