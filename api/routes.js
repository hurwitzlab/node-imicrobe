'use strict';

var printf     = require('printf');
var cors       = require('cors');
var Promise    = require('promise');
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
var mongo      = require('../config/mongo').mongo;
var sequelize  = require('../config/mysql').sequelize;
var models     = require('./models/index');

module.exports = function(app) {
    app.use(cors());

    app.get('/apps', function(request, response) {
        console.log('/apps');

        models.app.findAll()
        .then( data => response.json(data) );
    });

    app.get('/apps/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/app/' + id);

        models.app.findOne({
            where: { app_id: id },
//            include: [
//                { model: models.app_run
//                }
//            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/assemblies', function(request, response) {
        console.log('/assemblies');

        models.assembly.findAll({
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/assemblies/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/assemblies/' + id);

        models.assembly.findOne({
            where: { assembly_id: id },
            include: [
                { model: models.project
                , attributes : [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/combined_assemblies', function(request, response) {
        console.log('/combined_assemblies');

        models.combined_assembly.findAll({
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                },
                { model: models.sample
                , attributes: [ 'sample_id', 'sample_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/combined_assemblies/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/combined_assemblies/' + id);

        models.combined_assembly.findOne({
            where: { combined_assembly_id: id },
            include: [
                { model: models.project
                , attributes : [ 'project_id', 'project_name' ]
                },
                { model: models.sample
                , attributes: [ 'sample_id', 'sample_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/domains', function(request, response) {
        console.log('/domains');

        models.domain.findAll({
            include: [
                { model: models.project 
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/domains/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/domains/' + id);

        models.domain.findOne({
            where: { domain_id: id },
            include: [
                { model: models.project 
                , attributes : [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/investigators/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/investigators/' + id);

        models.investigator.findOne({
            where: { investigator_id: id },
            include: [
                { model: models.project },
                { model: models.sample }
            ]
        })
        .then( investigator => response.json(investigator) );
    });

    app.get('/investigators', function(request, response) {
        console.log('/investigators');

        models.investigator.findAll()
        .then( investigator => response.json(investigator) );
    });

    app.get('/project_groups', function(request, response) {
        console.log('/project_groups');

        models.project_group.findAll({
            include: [
                { model: models.project 
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    })

    app.get('/project_groups/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/project_groups/' + id);

        models.project_group.findOne({
            where: { project_group_id: id },
            include: [
                { model: models.project 
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/projects/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/projects/' + id);

        models.project.findOne({
            where: { project_id: id },
            include: [
                { model: models.investigator },
                { model: models.domain },
                { model: models.publication },
                { model: models.sample },
                { model: models.project_group
                , attributes: [ 'project_group_id', 'group_name' ]
                }
            ]
        })
        .then( project => response.json(project) );
    });

    app.get('/projects', function(request, response) {
        console.log('/projects');

        models.project.findAll({
            include: [
                { model: models.investigator },
                { model: models.domain }
            ]
        })
        .then( project => response.json(project) );
    });

    app.get('/publications', function(request, response) {
        console.log('/publications');

        models.publication.findAll({
            attributes: [ 'publication_id', 'title', 'author' ],
            include: [
                { model: models.project 
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        })
        .then( data => response.json(data) );
    });


    app.get('/publications/:id(\\d+)', function(request, response) {
        var id = request.params.id;
        console.log('/publications/' + id);

        models.publication.findOne({
            where: { publication_id: id },
            include: [
                { model: models.project }
            ]
        })
        .then( data => response.json(data) );
    });

    app.get('/search/:query', function (request, response) {
        var query = request.params.query;
        console.log("/search/" + query);

        getSearchResults(query)
        .then((data) => response.json(data));
    });

    app.get('/samples/:id(\\d+)', function (request, response) {
        var id = request.params.id;
        console.log('/samples/' + id);

        models.sample.findOne({
            where: { sample_id: id },
            include: [
                { model: models.project },
                { model: models.investigator },
                { model: models.sample_file },
                { model: models.ontology }
            ]
        })
        .then( sample => response.json(sample) );
    });

    app.get('/samples', function(request, response) {
        console.log('/samples', request.query);

        var params = {
            attributes:
                [ 'sample_id'
                , 'sample_name'
                , 'sample_acc'
                , 'sample_type'
                , 'project_id'
                ],
            include: [
                { model: models.project
                , attributes: [ 'project_id', 'project_name' ]
                }
            ]
        };

        if (typeof request.query.id !== 'undefined') {
            var ids = request.query.id.split(',');
            params.where = { sample_id: { in: ids } };
        }

        models.sample.findAll(params)
        .then( sample => response.json(sample) );
    });

    app.get('/samples/files', function(request, response) {
        console.log('/samples/files', request.query);

        var params = {
            attributes:
                [ 'sample_file_id'
                , 'sample_id'
                , 'file'
                ],
            include: [
                { model: models.sample
                , attributes: [ 'sample_id', 'sample_name' ]
                },
                { model: models.sample_file_type
                , attributes: [ 'sample_file_type_id', 'type' ]
                }
            ]
        };

        if (typeof request.query.id !== 'undefined') {
            var ids = request.query.id.split(',');
            params.where = { sample_id: { in: ids } };
        }

        models.sample_file.findAll(params)
        .then( sample => response.json(sample) );
    });

    app.post('/samples/search', jsonParser, function (request, response) {
        console.log("/samples/search");
        mongo()
        .then((db)   => getMetaSearchResults(db, request.body))
        .then((data) => response.json(data))
        .catch((err) => response.status(500).send("Err: " + err));
    });

    app.get('/search_params', function (request, response) {
        console.log("/search_params");
        mongo()
        .then((db)   => getSampleKeys(db))
        .then((data) => response.json(data))
        .catch((err) => response.status(500).send(err));
    });

    app.post('/search_param_values', jsonParser, function (req, res) {
      var param = req.body.param;
      var query = req.body.query;
      console.log("/search_params for " + param);

      mongo()
        .then(db =>
          Promise.all([getSampleKeys(db, param), getMetaParamValues(db, param, query)]))
          .then(filterMetaParamValues)
          .then(data => res.json({[param]: data}))
          .catch(err => res.status(500).send("Error: " + JSON.stringify(err)));
    });

    app.get('/', function(request, response){
        var routes = app._router.stack        // registered routes
                     .filter(r => r.route)    // take out all the middleware
                     .map(r => r.route.path)
        response.json({ "routes": routes });
    });

    // catch-all function
    app.get('*', function(request, response){
        response.status(404).send("Unknown route: " + request.path);
    });
};

function getSearchResults(query) {
  return new Promise(function (resolve, reject) {
    sequelize.query(
      printf(
        `
        select table_name, primary_key as id, object_name as name
        from   search
        where  match (search_text) against (%s in boolean mode)
        `,
        sequelize.getQueryInterface().escape(query)
      ),
      { type: sequelize.QueryTypes.SELECT }
    )
    .then(results => resolve(results));
  });
}

function getSampleKeys(db, optField) {
  /*
   * Keys look like this:
   *
   * { _id: { key: 'specimen__volume' },
   *  value: { types: { Number: 190, String: 16 } },
   *  totalOccurrences: 206,
   *  percentContaining: 4.092173222089789 }
   *
   * We need to take the most frequent of the "types"
   * and return just
   *
   * { 'specimen__volume': 'number' }
   *
   */
  return new Promise(function (resolve, reject) {
    var col = db.collection('sampleKeys');
    var qry = ((typeof(optField) != "undefined") && (optField != ""))
              ? { _id: { key: optField } }
              : {};
    console.log(qry);

    col.find(qry).toArray(function(err, docs) {
      if (err)
        reject(err);
      else {
        var keys = docs.filter((item) => {
          var name = item._id.key;
          return (name !== "" && name !== "_id");
        }).reduce((acc, item) => {
          var name  = item._id.key;
          var types = item.value.types;
          var type  = Object.keys(types)
            .sort((a,b) => types[a] - types[b])
            .reverse()[0];
          acc[name] = type.toLowerCase();
          return acc;
        }, {});

        resolve(keys);
      }
    });
  });
}

function getMetaParamValues(db, fieldName, query) {
  if (typeof(query) == "undefined")
    query = {}

  var qry = fixMongoQuery(query);

  return new Promise(function (resolve, reject) {
    db.command(
      { distinct: "sample", key: fieldName, query: qry },
      function (err, res) {
        if (!err && res.ok)
          resolve(res['values'])
        else
          reject(err)
      }
    );
  });
}

function filterMetaParamValues(args) {
  var [dataType, data] = args

  var type = (typeof(dataType) == "object" && Object.keys(dataType).length == 1)
             ? Object.values(dataType)[0]
             : undefined;

  var f = function (val) { return type ? typeof(val) == type : true }
  var sorter = type == 'number'
    ? function (a, b) { return a - b }
    : function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()) };

  return Promise.resolve(data.filter(f).sort(sorter));
}

function fixMongoQuery(query) {
  return Object.keys(query)
    .filter(x => { return !(query[x] == null || query[x].length == 0) })
    .reduce(
    (acc, key) => {
      var val = query[key]

      // e.g., { min__biological__chlorophyll: 1 }
      if (key.match(/^(min|max)__/)) {
        var prefix = key.substr(0, 3)
        var param  = key.substr(5)

        if (acc[param] == undefined)
          acc[param] = {}

        var op = prefix == 'min' ? '$gte' : '$lte'
        acc[param][op] = val
      }
      // e.g., { environment__general_weather: "cloudy" }
      else if (Array.isArray(val)) {
        if (acc[key] == undefined)
          acc[key] = {}

        acc[key]['$in'] = val
      }
      else
        acc[key] = val

      return acc
    },
    {}
  );
}

function getMetaSearchResults(db, query) {
  return new Promise(function (resolve, reject) {
    if (typeof(query) == "object" && Object.keys(query).length > 0) {
      var qry = fixMongoQuery(query);

      // I don't want the "text" field in the projection
      var project = { "text" : 0 }

      db.collection('sample').find(qry, project).toArray(
        function(err, docs) {
          if (err) reject(err)
          resolve(docs)
        }
      );
    }
    else {
      reject("Bad query (" + JSON.stringify(query) + ")")
    }
  });
}
