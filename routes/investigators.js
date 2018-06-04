const models = require('../models');
const express = require('express');
const router  = express.Router();
const toJsonOrError = require('./utils').toJsonOrError;

router.get('/investigators/:id(\\d+)', function(req, res, next) {
    toJsonOrError(res, next,
        models.investigator.findOne({
            where: { investigator_id: req.params.id },
            include: [
                { model: models.project
                , through: { attributes: [] } // remove connector table from output
                },
                { model: models.sample
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
    );
});

router.get('/investigators/:name(\\w+)', function(req, res, next) {
    toJsonOrError(res, next,
        models.investigator.findAll({
            where: { investigator_name: { $like: "%"+req.params.name+"%" } }
        })
    );
});

router.get('/investigators', function(req, res, next) {
    toJsonOrError(res, next,
        models.investigator.findAll()
    );
});

router.put('/investigators', function(req, res, next) {
    var name = req.body.name;
    var institution = req.body.institution;

    errorOnNull(name, institution);

    requireAuth(req);

    toJsonOrError(res, next,
        models.investigator.create({
            name: name,
            institution: institution,
            url: req.body.url
        })
        .then( () =>
            logAdd(req, {
                title: "Added investigator " + name,
                type: "addInvestigator",
                name: name,
                institution: institution
            })
        )
    );
});

module.exports = router;