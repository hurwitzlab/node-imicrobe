const sequelize = require('../config/mysql').sequelize;
const models = require('../models');
const express = require('express');
const router  = express.Router();
const errors = require('../libs/errors');
const toJsonOrError = require('../libs/utils').toJsonOrError;
const requireAuth = require('../libs/utils').requireAuth;
const errorOnNull = require('../libs/utils').errorOnNull;
const logAdd = require('../libs/utils').logAdd;
const permissions = require('../libs/permissions')(sequelize);

router.get('/pubchase', function(req, res, next) {
    toJsonOrError(res, next,
        models.pubchase.findAll()
    );
});

router.get('/publications', function(req, res, next) {
    toJsonOrError(res, next,
        models.publication.findAll({
            attributes: [ 'publication_id', 'title', 'author' ],
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
    );
});

router.get('/publications/:id(\\d+)', function(req, res, next) {
    toJsonOrError(res, next,
        models.publication.findOne({
            where: { publication_id: req.params.id },
            include: [
                { model: models.project },
                { model: models.project_file
                , attributes: [ 'project_file_id', 'project_id', 'file', 'description' ]
                , include: [ { model: models.project_file_type } ]
                , through: { attributes: [] } // remove connector table from output
                }
            ]
        })
    );
});

router.put('/publications', function(req, res, next) { //FIXME change route to be projects/publications?
    requireAuth(req);

    var projectId = req.body.project_id;
    errorOnNull(projectId);

    toJsonOrError(res, next,
        permissions.requireProjectEditPermission(projectId, req.auth.user)
        .then( () =>
            models.publication.create({
                project_id: projectId,
                title: req.body.title,
                author: req.body.authors,
                pub_date: req.body.date,
                pubmed_id: req.body.pubmed_id,
                doi: req.body.doi
            })
        )
        .then( publication =>
            models.project.findOne({ where: { project_id: projectId } })
            .then( project =>
                logAdd(req, {
                    title: "Added publication '" + publication.get().title + "' to project '" + project.project_name + "'",
                    type: "addPublication",
                    project_id: projectId,
                    publication_id: publication.get().publication_id
                })
                .then( () => publication )
            )
        )
    );
});

router.post('/publications/:publication_id(\\d+)', function (req, res, next) { //FIXME change route to be projects/publications?
    requireAuth(req);

    toJsonOrError(res, next,
        models.publication.findOne({ where: { publication_id: req.params.publication_id } })
        .then( publication =>
            permissions.requireProjectEditPermission(publication.project_id, req.auth.user)
            .then( () =>
                logAdd(req, {
                    title: "Updated publication '" + publication.title + "'",
                    type: "updatePublication",
                    publication_id: req.params.publication_id
                })
            )
        )
        .then( () =>
            models.publication.update(
                { title: req.body.title,
                  author: req.body.authors,
                  pub_date: req.body.date,
                  pubmed_id: req.body.pubmed_id,
                  doi: req.body.doi
                },
                { where: { publication_id: req.params.publication_id } }
            )
        )
        .then( result =>
            models.publication.findOne({
                where: { publication_id: req.params.publication_id }
            })
        )
    );
});

router.delete('/publications/:publication_id(\\d+)', function (req, res, next) {
    requireAuth(req);

    toJsonOrError(res, next,
        models.publication.findOne({ where: { publication_id: req.params.publication_id } })
        .then( publication =>
            permissions.requireProjectEditPermission(publication.project_id, req.auth.user)
            .then( () =>
                logAdd(req, {
                    title: "Removed publication '" + publication.title + "'",
                    type: "removePublication",
                    publication_id: req.params.publication_id
                })
            )
        )
        .then( () =>
            models.publication.destroy({
                where: { publication_id: req.params.publication_id }
            })
        )
    );
});

module.exports = router;