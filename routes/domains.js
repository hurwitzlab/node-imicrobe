const models = require('../models');
const express = require('express');
const router  = express.Router();
const toJsonOrError = require('../libs/utils').toJsonOrError;

router.get('/domains', function(req, res, next) {
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

router.get('/domains/:id(\\d+)', function(req, res, next) {
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

module.exports = router;