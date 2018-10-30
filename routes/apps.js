const sequelize = require('../config/mysql').sequelize;
const models = require('../models');
const express = require('express');
const router  = express.Router();
const errors = require('../libs/errors');
const toJsonOrError = require('../libs/utils').toJsonOrError;
const requireAuth = require('../libs/utils').requireAuth;
const errorOnNull = require('../libs/utils').errorOnNull;
const logAdd = require('../libs/utils').logAdd;

router.get('/apps', function(req, res, next) {
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

router.get('/apps/:id(\\d+)', function(req, res, next) {
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

router.get('/apps/:name([\\w\\.\\-\\_]+)', function(req, res, next) {
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

router.post('/apps/runs', function(req, res, next) {
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
                title: "Ran app " + app.app_name,
                type: "runApp",
                app_id: app_id,
                app_name: app.app_name
            })
        )
    );
});

module.exports = router;