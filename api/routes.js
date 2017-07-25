'use strict';

var cors = require('cors');
var sequelize = require('../config/mysql').sequelize;
var models = require('./models/index');

module.exports = function(app) {
    app.use(cors());

    app.get('/projects/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/projects/' + id);

        models.project.findOne({
            where: { project_id: id },
            include: [
                { model: models.investigator },
                { model: models.domain },
                { model: models.publication },
                { model: models.sample }
            ]
        })
        .then( project => response.json(project) );
    });

    app.get('/projects', function(request, response) {
        var id = request.params.id;
        console.log('/projects');

        models.project.findAll({
            include: [
                { model: models.investigator },
                { model: models.domain }
            ]
        })
        .then( project => response.json(project) );
    });
};