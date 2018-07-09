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

router.get('/sample_groups', function(req, res, next) {
    //requireAuth(req); // don't require authentication, just return empty list for anonymous request

    var whereClause = {};
    if (req.auth.validToken)
        whereClause.user_id = req.auth.user.user_id;
    if (req.query.term)
        whereClause.group_name = { $like: "%"+req.query.term+"%" };

    toJsonOrError(res, next,
        models.sample_group.findAll({
            where: whereClause,
            include: [
                { model: models.sample
                , attributes: [ 'sample_id', 'sample_name', 'project_id' ]
                , through: { attributes: [] } // remove connector table
                , include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    },
                    { model: models.sample_file
                    , attributes: [ 'sample_file_id', 'sample_id', 'sample_file_type_id', 'file' ]
                    , include: [
                        { model: models.sample_file_type
                        , attributes: [ 'sample_file_type_id', 'type' ]
                        }
                      ]
                    }
                  ]
                }
            ]
        })
//        .then( groups => { // filter on permission
//            return groups.filter(group => {
//                var hasAccess =
//                    req.auth.user && req.auth.user.user_name &&
//                    group.users.map(u => u.user_name).includes(req.auth.user.user_name);
//                return !group.private || hasAccess;
//            })
//        })
    );
})

router.get('/sample_groups/:id(\\d+)', function(req, res, next) {
    toJsonOrError(res, next,
        models.sample_group.findOne({
            where: {
                sample_group_id: req.params.id
            },
            include: [
                { model: models.sample
                , attributes: [ 'sample_id', 'sample_name', 'project_id' ]
                , through: { attributes: [] } // remove connector table
                , include: [
                    { model: models.project
                    , attributes: [ 'project_id', 'project_name' ]
                    },
                    { model: models.sample_file
                    , attributes: [ 'sample_file_id', 'sample_id', 'sample_file_type_id', 'file' ]
                    , include: [
                        { model: models.sample_file_type
                        , attributes: [ 'sample_file_type_id', 'type' ]
                        }
                      ]
                    }
                  ]
                }
            ]
        })
    );
});

router.put('/sample_groups', function(req, res, next) {
    requireAuth(req);

    var groupName = req.body.group_name;
    var sampleIds = req.body.sample_ids; // optional
    var userId = req.auth.user.user_id;

    errorOnNull(groupName);

    toJsonOrError(res, next,
        models.sample_group.create({
            group_name: groupName,
            description: "",
            url: "",
            user_id: userId
        })
        .then( sample_group =>
            logAdd(req, {
                title: "Saved cart '" + groupName + "'",
                type: "saveCart",
                user_id: userId,
                cart_id: sample_group.sample_group_id
            })
            .then( () =>
                Promise.all(
                    sampleIds.map( id =>
                        models.sample_to_sample_group.create({
                            sample_id: id,
                            sample_group_id: sample_group.sample_group_id
                        })
                    )
                )
            )
            .then( () => sample_group )
        )
        .then( sample_group =>
            models.sample_group.findOne({
                where: {
                    sample_group_id: sample_group.sample_group_id
                },
                include: [
                    { model: models.sample
                    , attributes: [ 'sample_id', 'sample_name', 'project_id' ]
                    , through: { attributes: [] } // remove connector table
                    , include:
                        { model: models.project
                        , attributes: [ 'project_id', 'project_name' ]
                        }
                    }
                ]
            })
        )
    );
});

router.delete('/sample_groups/:id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        models.sample_group.findOne({
            where: {
                sample_group_id: req.params.id,
                user_id: req.auth.user.user_id
            }
        })
        .then( group =>
            logAdd(req, {
                title: "Removed cart '" + group.group_name + "'",
                type: "removeCart",
                sample_group_id: group.sample_group_id
            })
        )
        .then( () =>
            models.sample_group.destroy({
                where: {
                    sample_group_id: req.params.id
                }
            })
        )
    );
});

// Remove a sample from a Sample Group
router.delete('/sample_groups/:sample_group_id(\\d+)/samples/:sample_id(\\d+)', function(req, res, next) {
    requireAuth(req);

    var sampleGroupId = req.params.sample_group_id;
    var sampleId = req.params.sample_id;
    var userId = req.auth.user.user_id;

    toJsonOrError(res, next,
        models.sample_group.findOne({
            where: {
                sample_group_id: sampleGroupId,
                user_id: userId
            }
        })
        .then( sample_group =>
            logAdd(req, {
                title: "Remove sample '" + sampleId + "' from cart '" + sample_group.group_name + "'",
                type: "removeSampleFromSampleGroup",
                target_user_id: req.params.user_id,
                sample_group_id: sampleGroupId,
                sample_id: sampleId
            })
        )
        .then( () =>
            models.sample_to_sample_group.destroy({
                where: {
                    sample_group_id: sampleGroupId,
                    sample_id: sampleId
                }
            })
        )
        .then( () =>
            models.sample_group.findOne({
                where: {
                    sample_group_id: sampleGroupId,
                    user_id: userId
                },
                include: [
                    { model: models.sample
                    , attributes: [ 'sample_id', 'sample_name', 'project_id' ]
                    , through: { attributes: [] } // remove connector table
                    , include:
                        { model: models.project
                        , attributes: [ 'project_id', 'project_name' ]
                        }
                    }
                ]
            })
        )
    );
});

// Remove all samples from a Sample Group
router.delete('/sample_groups/:sample_group_id(\\d+)/samples', function(req, res, next) {
    requireAuth(req);

    var sampleGroupId = req.params.sample_group_id;
    var userId = req.auth.user.user_id;

    toJsonOrError(res, next,
        models.sample_group.findOne({
            where: {
                sample_group_id: sampleGroupId,
                user_id: userId
            },
            include: [ models.sample ]
        })
        .then( sample_group =>
            logAdd(req, {
                title: "Remove all samples from cart '" + sample_group.group_name + "'",
                type: "removeSampleFromSampleGroup",
                target_user_id: req.params.user_id,
                sample_group_id: sampleGroupId,
            })
            .then( () =>
                Promise.all(
                    sample_group.samples.map(sample =>
                        models.sample_to_sample_group.destroy({
                            where: {
                                sample_group_id: sampleGroupId,
                                sample_id: sample.sample_id
                            }
                        })
                    )
                )
            )
        )
        .then( () =>
            models.sample_group.findOne({
                where: {
                    sample_group_id: sampleGroupId,
                    user_id: userId
                },
                include: [
                    { model: models.sample
                    , attributes: [ 'sample_id', 'sample_name', 'project_id' ]
                    , through: { attributes: [] } // remove connector table
                    }
                ]
            })
        )
    );
});

module.exports = router;