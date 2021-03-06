const sequelize = require('../config/mysql').sequelize;
const models = require('../models');
const mongo = require('../config/mongo').mongo;
const express = require('express');
const router  = express.Router();
const Promise = require('promise');
const errors = require('../libs/errors');
const toJsonOrError = require('../libs/utils').toJsonOrError;
const requireAuth = require('../libs/utils').requireAuth;
const errorOnNull = require('../libs/utils').errorOnNull;
const logAdd = require('../libs/utils').logAdd;
const permissions = require('../libs/permissions')(sequelize);

router.get('/users/search', function(req, res, next) {
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

router.get('/users', function(req, res, next) { // Get an individual user based on the token
    requireAuth(req);

    var userId = req.auth.user.user_id;

    toJsonOrError(res, next,
        Promise.all([
            models.user.findOne({
                where: { user_id: userId },
                include: [
                    { model: models.project.scope('withUsers'),
                      attributes: [
                        "project_id", "project_name", "project_code", "project_type", "url",
                        [ sequelize.literal('(SELECT COUNT(*) FROM sample WHERE sample.project_id = projects.project_id)'), 'sample_count' ]
                      ],
                      through: { attributes: [] }, // remove connector table
                      include: [
                        { model: models.investigator,
                          attributes: [ 'investigator_id', 'investigator_name', 'institution' ],
                          through: { attributes: [] } // remove connector table
                        },
                        { model: models.publication },
                        { model: models.sample,
                          attributes: [
                            "sample_id", "sample_name", "sample_acc", "sample_type",
                            [ sequelize.literal('(SELECT COUNT(*) FROM sample_file WHERE sample_file.sample_id = `projects->samples`.`sample_id`)'), 'sample_file_count' ]
                          ],
                          include: [
                            { model: models.sample_file,
                              attributes: [ "sample_file_id", "sample_id", "file" ]
                            },
                            { model: models.project,
                              attributes: [ "project_id", "project_name" ]
                            }
                          ]
                        },
                      ]
                    }
                ]
            }),

            // Split this sub-query out from above query due to extreme slowness (because of nested user table inclusions)
            models.user.findOne({
                where: { user_id: userId },
                include: [
                    { model: models.project_group.scope('withUsers')
                    , attributes: [ "project_group_id", "group_name", "description", "url" ]
                    , through: { attributes: [] } // remove connector table
                    , include: [
                        { model: models.project
                        , attributes: [ "project_id", "project_name", "project_code", "project_type", "url" ]
                        , through: { attributes: [] } // remove connector table
                        }
                      ]
                    }
                ]
            }),

            mongo()
            .then( db => {
                return new Promise(function (resolve, reject) {
                    db.collection('log').find(
                        { user_id: userId*1 }, // ensure integer value
                        { _id: 1, date: 1, title: 1, url: 1 }
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
            if (!user)
                throw(errors.ERR_NOT_FOUND);
            user.dataValues.project_groups = results[1].dataValues.project_groups;
            user.dataValues.log = results[2];
            return user;
        })
    );
});

router.get('/users/:name([\\w\\.\\-\\_]+)', function(req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        models.user.findOne({
            where: { user_name: req.params.name }
        })
    );
});

router.post('/users/login', function(req, res, next) {
    requireAuth(req);

    var username = req.auth.user.user_name;

    // Add user if not already present
    models.user.findOrCreate({
        where: { user_name: username }
    })
    .spread( (user, created) => {
        // For new user set first_name/last_name/email, or update for existing user (in case they changed any of those fields)
        models.user.update(
            { first_name: req.auth.user.first_name
            , last_name: req.auth.user.last_name
            , email: req.auth.user.email
            },
            { where: { user_name: username } }
        )
        // Record login
        .then( () =>
            models.login.create({
                user_id: user.user_id,
                login_date: sequelize.fn('NOW')
            })
        )
        .then( login =>
            models.user.findOne({
                where: { user_id: user.user_id }
            })
            .then( user =>
                res.json({ // Respond w/o login_date: this is a workaround to prevent Elm decoder from failing on login_date = "fn":"NOW"
                    login_id: login.login_id,
                    user: user
                })
            )
        );
    })
    .catch(next);
});

module.exports = router;