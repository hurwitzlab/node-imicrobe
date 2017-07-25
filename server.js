'use strict';

var assert      = require('assert');
var bodyParser  = require('body-parser');
var cluster     = require('cluster');
var cors        = require('cors');
var jsonParser  = bodyParser.json();
var MongoClient = require('mongodb').MongoClient;
var printf      = require('printf');
var Promise     = require('promise');
var express = require('express');


// Load config file
var config = require('./config.json');

// Spawn workers and start server
var workers = process.env.WORKERS || require('os').cpus().length;
var app = express();
require('./api/routes.js')(app);

if (cluster.isMaster) {
    console.log('Start cluster with %s workers', workers);

    for (var i = 0; i < workers; ++i) {
        var worker = cluster.fork().process;
        console.log('Worker %s started.', worker.pid);
    }

    cluster.on('online', function(worker) {
        console.log('Worker ' + worker.process.pid + ' is online');
    });

    cluster.on('exit', function(worker) {
        console.log('Worker %s died. restarting...', worker.process.pid);
        cluster.fork();
    });

}
else {
    var server = app.listen(config.serverPort, function() {
        console.log('Process ' + process.pid + ' is listening to all incoming requests on port ' + config.serverPort);
    });
}

// Global uncaught exception handler
process.on('uncaughtException', function (err) {
    console.error((new Date).toUTCString() + ' uncaughtException:', err.message)
    console.error(err.stack)
    process.exit(1)
})


// --------------------------------------------------
// Routes
// --------------------------------------------------
//app.use(cors());
//
//app.get('/investigators/:id(\\d+)', function (req, res) {
//  var id = req.params.id;
//  console.log("/investigators/" + id);
//  getInvestigator(id)
//    .then(getProjectsForInvestigator)
//    .then(getSamplesForInvestigator)
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err));
//})
//
//// --------------------------------------------------
//app.get('/investigators', function (req, res) {
//  console.log("/investigators");
//
//  getInvestigators()
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err));
//});
//
//// --------------------------------------------------
//app.get('/projects/:id(\\d+)', function (req, res) {
//  var id = req.params.id;
//  console.log("/projects/" + id);
//  getProject(id)
//    .then(getDomainsForProject)
//    .then(getInvestigatorsForProject)
//    .then(getPublicationsForProject)
//    .then(getSamplesForProject)
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err) );
//});
//
//// --------------------------------------------------
//app.get('/projects', function (req, res) {
//  console.log("/projects");
//  getProjects()
//    .then(getDomainsForProjects)
//    .then(getInvestigatorsForProjects)
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err));
//});
//
//// --------------------------------------------------
//app.get('/search/:query', function (req, res) {
//  var query = req.params.query;
//  console.log("/search/" + query);
//  getSearchResults(query)
//    .then((data) => res.json(data));
//});
//
//// --------------------------------------------------
//app.get('/samples/:id(\\d+)', function (req, res) {
//  var id = req.params.id;
//  console.log("/samples/" + id);
//  getSample(id)
//    .then(getInvestigatorsForProject)
//    .then(getFilesForSample)
//    .then(getOntologiesForSample)
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err));
//});
//
//// --------------------------------------------------
//app.get('/samples', function (req, res) {
//  console.log("/samples");
//  getSamples()
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err));
//});
//
//
//// --------------------------------------------------
//app.post('/samplesearch', jsonParser, function (req, res) {
//  console.log("/samplesearch");
//  connectMongo()
//    .then((db)   => getMetaSearchResults(db, req.body))
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err));
//});
//
//// --------------------------------------------------
//app.get('/search_params', function (req, res) {
//  console.log("/search_params");
//  connectMongo()
//    .then((db)   => getSampleKeys(db))
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err));
//});
//
//
//// --------------------------------------------------
//app.get('/search/:query', function (req, res) {
//  var query = req.params.query;
//  console.log("/search/" + query);
//  getSearchResults(query)
//    .then((data) => res.json(data))
//    .catch((err) => res.status(500).send(err));
//});
//
//// --------------------------------------------------
//app.get('/', function(req, res){
//  var routes = app._router.stack        // registered routes
//               .filter(r => r.route)    // take out all the middleware
//               .map(r => r.route.path)
//  res.json({ "routes": routes });
//});
//
//// --------------------------------------------------
//// catch-all function
//app.get('*', function(req, res){
//  res.status(500).send("Unknown route: " + req.path);
//});
//
//
//// --------------------------------------------------
//// Database Queries
//// --------------------------------------------------
//
//function getProject(id) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      'select * from project where project_id=?',
//      [id],
//      function (error, results, fields) {
//        if (error) reject(error);
//        if (results.length == 1)
//          resolve(results[0]);
//        else
//          reject("Bad project id: " + id);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getInvestigators() {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `select   investigator_id, investigator_name,
//                institution
//       from     investigator
//       order by investigator_name
//      `,
//      function (error, results, fields) {
//        if (error) reject(error);
//        resolve(results);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getProjects() {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      'select * from project',
//      function (error, results, fields) {
//        if (error) reject(error);
//        resolve(results);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getDomainsForProject(project) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select   d.domain_id, d.domain_name
//        from     domain d, project_to_domain p2d
//        where    p2d.project_id=?
//        and      p2d.domain_id=d.domain_id
//        order by domain_name
//      `,
//      [project.project_id],
//      function (error, results, fields) {
//        if (error) return reject(err);
//        project['domains'] = results;
//        resolve(project);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getDomainsForProjects(projects) {
//  return Promise.all(projects.map(getDomainsForProject));
//}
//
//// --------------------------------------------------
//function getInvestigatorsForProject(project) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select   i.investigator_id, i.investigator_name, i.institution
//        from     project_to_investigator p2i, investigator i
//        where    p2i.project_id=?
//        and      p2i.investigator_id=i.investigator_id
//        order by investigator_name
//      `,
//      [project.project_id],
//      function (error, results, fields) {
//        if (error) return reject(err);
//        project['investigators'] = results;
//        resolve(project);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getInvestigatorsForProjects(projects) {
//  return Promise.all(projects.map(getInvestigatorsForProject));
//}
//
//// --------------------------------------------------
//function getPublicationsForProject(project) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select   p.publication_id, p.pub_code, p.doi,
//                 p.author, p.title, p.pubmed_id, p.journal, p.pub_date
//        from     publication p
//        where    p.project_id=?
//      `,
//      [project.project_id],
//      function (error, results, fields) {
//        if (error) return reject(err);
//        project['publications'] = results;
//        resolve(project);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getSample(id) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select s.sample_id, s.sample_acc, s.sample_name,
//               s.sample_type, s.sample_description, s.comments,
//               s.taxon_id, s.url, p.project_id, p.project_name
//        from   sample s, project p
//        where  s.sample_id=?
//        and    s.project_id=p.project_id
//      `,
//      [id],
//      function (error, results, fields) {
//        if (error) reject(error);
//        if (results.length == 1)
//          resolve(results[0]);
//        else
//          reject("Bad sample id: " + id);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getSearchResults(query) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      printf(
//        `
//        select table_name, primary_key as id, object_name as name
//        from   search
//        where  match (search_text) against (%s in boolean mode)
//        `,
//        connection.escape(query)
//      ),
//      function (error, results, fields) {
//        if (error) return reject(err);
//        resolve(results);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getSamples() {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select s.sample_id, s.sample_acc, s.sample_name,
//               s.sample_type, s.sample_description, s.comments,
//               s.taxon_id, s.url, p.project_id, p.project_name
//        from   sample s, project p
//        where  s.project_id=p.project_id
//      `,
//      function (error, results, fields) {
//        if (error) reject(error);
//        resolve(results);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getSamplesForProject(project) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select s.sample_id, s.sample_acc, s.sample_name,
//               s.sample_type, s.sample_description, s.comments,
//               s.taxon_id, s.url, s.latitude, s.longitude
//        from   sample s
//        where  s.project_id=?
//
//      `,
//      [project.project_id],
//      function (error, results, fields) {
//        if (error) reject(error);
//        project['samples'] = results;
//        resolve(project);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getInvestigator(id) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      'select * from investigator where investigator_id=?',
//      [id],
//      function (error, results, fields) {
//        if (error) reject(error);
//        if (results.length == 1)
//          resolve(results[0]);
//        else
//          reject("Bad investigator id: " + id);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getProjectsForInvestigator(investigator) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select p.project_id, p.project_name
//        from   project_to_investigator p2i, project p
//        where  p2i.investigator_id=?
//        and    p2i.project_id=p.project_id
//      `,
//      [investigator.investigator_id],
//      function (error, results, fields) {
//        if (error) reject(error);
//        investigator['projects'] = results;
//        resolve(investigator);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getSamplesForInvestigator(investigator) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select s.sample_id, s.sample_name, s.sample_type,
//               s.latitude, s.longitude
//        from   project_to_investigator p2i, project p, sample s
//        where  p2i.investigator_id=?
//        and    p2i.project_id=p.project_id
//        and    p.project_id=s.project_id
//      `,
//      [investigator.investigator_id],
//      function (error, results, fields) {
//        if (error) reject(error);
//        investigator['samples'] = results;
//        resolve(investigator);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getFilesForSample(sample) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select f.sample_file_id, f.file, f.num_seqs, f.num_bp, f.avg_len,
//               t.sample_file_type_id, t.type as file_type
//        from   sample_file f, sample_file_type t
//        where  f.sample_id=?
//        and    f.sample_file_type_id=t.sample_file_type_id
//      `,
//      [sample.sample_id],
//      function (error, results, fields) {
//        if (error) reject(error);
//        sample['files'] = results;
//        resolve(sample);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function getOntologiesForSample(sample) {
//  return new Promise(function (resolve, reject) {
//    connection.query(
//      `
//        select o.ontology_acc, o.label,
//               t.type as ontology_type
//        from   sample_to_ontology s2o, ontology o, ontology_type t
//        where  s2o.sample_id=?
//        and    s2o.ontology_id=o.ontology_id
//        and    o.ontology_type_id=t.ontology_type_id
//      `,
//      [sample.sample_id],
//      function (error, results, fields) {
//        if (error) reject(error);
//        sample['ontologies'] = results;
//        resolve(sample);
//      }
//    );
//  });
//}
//
//// --------------------------------------------------
//function connectMongo() {
//  return new Promise(function (resolve, reject) {
//    MongoClient.connect(config.mongo.url, (err, db) => {
//      if (err)
//        reject(err)
//      else
//        resolve(db)
//    });
//  });
//}
//
//// --------------------------------------------------
//function getSampleKeys(db) {
//  /*
//   * Keys look like this:
//   *
//   * { _id: { key: 'specimen__volume' },
//   *  value: { types: { Number: 190, String: 16 } },
//   *  totalOccurrences: 206,
//   *  percentContaining: 4.092173222089789 }
//   *
//   * We need to take the most frequent of the "types"
//   * and return just
//   *
//   * { 'specimen__volume': 'number' }
//   *
//   */
//  return new Promise(function (resolve, reject) {
//    var col = db.collection('sampleKeys');
//    col.find().toArray(function(err, docs) {
//      if (err)
//        reject(err);
//      else {
//        var keys = docs.filter((item) => {
//          var name = item._id.key;
//          return (name !== "" && name !== "_id");
//        }).reduce((acc, item) => {
//          var name  = item._id.key;
//          var types = item.value.types;
//          var type  = Object.keys(types)
//            .sort((a,b) => types[a] - types[b])
//            .reverse()[0];
//          acc[name] = type.toLowerCase();
//          return acc;
//        }, {});
//        resolve(keys);
//      }
//    });
//  });
//}
//
//// --------------------------------------------------
//function getMetaSearchResults(db, query) {
//  return new Promise(function (resolve, reject) {
//    if (typeof(query) == "object" && Object.keys(query).length > 0) {
//
//      qry = query
//      db.collection('sample').find(query).toArray(
//        function(err, docs) {
//          if (err) reject(err)
//          resolve(docs)
//        }
//      );
//    }
//    else {
//      reject("Bad query (" + JSON.stringify(query) + ")")
//    }
//  });
//}