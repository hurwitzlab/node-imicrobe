const models = require('../models');
const express = require('express');
const router  = express.Router();
const toJsonOrError = require('./utils').toJsonOrError;

router.get('/assemblies', function(req, res, next) {
    //TODO currently private samples cannot have assemblies, but in the future will need to check permissions on parent project
    toJsonOrError(res, next,
        models.assembly.findAll({
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
    );
});

router.get('/assemblies/:id(\\d+)', function(req, res, next) {
    //TODO currently private samples cannot have assemblies, but in the future will need to check permissions on parent project
    toJsonOrError(res, next,
        models.assembly.findOne({
            where: { assembly_id: req.params.id },
            include: [
                { model: models.project
                , attributes : [ 'project_id', 'project_name' ]
                }
            ]
        })
    );
});

router.get('/combined_assemblies', function(req, res, next) {
    //TODO currently private samples cannot have combined_assemblies, but in the future will need to check permissions on parent project
    toJsonOrError(res, next,
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
    );
});

router.get('/combined_assemblies/:id(\\d+)', function(req, res, next) {
    //TODO currently private samples cannot have combined_assemblies, but in the future will need to check permissions on parent project
    toJsonOrError(res, next,
        models.combined_assembly.findOne({
            where: { combined_assembly_id: req.params.id },
            include: [
                { model: models.project
                , attributes : [ 'project_id', 'project_name' ]
                },
                { model: models.sample
                , attributes: [ 'sample_id', 'sample_name' ]
                }
            ]
        })
    );
});

module.exports = router;