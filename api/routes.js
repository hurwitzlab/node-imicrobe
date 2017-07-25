'use strict';

var printf = require('printf');
var cors = require('cors');
var Promise = require('promise');
var bodyParser  = require('body-parser');
var jsonParser  = bodyParser.json();
var mongo = require('../config/mongo').mongo;
var sequelize = require('../config/mysql').sequelize;
var models = require('./models/index');

module.exports = function(app) {
    app.use(cors());

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
        console.log('/projects');

        models.project.findAll({
            include: [
                { model: models.investigator },
                { model: models.domain }
            ]
        })
        .then( project => response.json(project) );
    });

    app.get('/search/:query', function (request, response) {
        var query = request.params.query;
        console.log("/search/" + query);

        getSearchResults(query)
        .then((data) => response.json(data));
    });

    app.get('/samples/:id(\\d+)', function (request, response) {
        var id = request.params.id;
        console.log("/samples/" + id);

        models.sample.findOne({
            where: { sample_id: id },
            include: [
                { model: models.investigator },
                { model: models.sample_file },
                { model: models.ontology }
            ]
        })
        .then( sample => response.json(sample) );
    });

    app.get('/samples', function(request, response) {
        console.log('/samples');

        models.sample.findAll()
        .then( sample => response.json(sample) );
    });

    app.post('/samplesearch', jsonParser, function (request, response) {
        console.log("/samplesearch");
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

    app.get('/search_param_values/:param', function (request, response) {
        var param = request.params.param;
        console.log("/search_param_values/" + param);

        mongo()
        .then(db => Promise.all([getSampleKeys(db, param), getMetaParamValues(db, param)]))
        .then(filterMetaParamValues)
        .then(data => response.json({[param]: data}))
        .catch(err => response.status(500).send("Error: " + JSON.stringify(err)));
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
        query
      ),
      function (error, results, fields) {
        if (error) return reject(err);
        resolve(results);
      }
    );
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

function getMetaParamValues(db, fieldName, dataType) {
  return new Promise(function (resolve, reject) {
    db.command(
      { distinct: "sample", key: fieldName, query: {} },
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
    ? undefined
    : function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()) };

  return Promise.resolve(data.filter(f).sort(sorter));
}

function getMetaSearchResults(db, query) {
  return new Promise(function (resolve, reject) {
    if (typeof(query) == "object" && Object.keys(query).length > 0) {

      var qry = Object.keys(query).reduce(
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
          else
            acc[key] = val

          return acc
        },
        {}
      );

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