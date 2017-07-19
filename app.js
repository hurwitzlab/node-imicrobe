"use strict";

const express = require('express')
const app = express()
const port = 3006;
var cors = require('cors')
var Promise = require('promise');
var printf = require('printf');
var config = require('./config.json');

app.use(cors())


// --------------------------------------------------
var mysql = require('mysql');
var connection = mysql.createConnection(config.mysql);


// --------------------------------------------------
app.get('/investigators/:id(\\d+)', function (req, res) {
  var id = req.params.id;
  console.log("/investigators/" + id);
  connection.query(
    'select * from investigator where investigator_id=?', 
    [id], 
    function (error, results, fields) {
      if (error) throw error;
      if (results.length == 1) {
        res.json(results[0]);
      }
      else {
        res.status(404).send("Bad investigator id: " + id);
      }
    }
  );
})


// --------------------------------------------------
app.get('/investigators', function (req, res) {
  console.log("/investigators");

  connection.query(
    `select   investigator_id, investigator_name, 
              institution
     from     investigator 
     order by investigator_name
    `,
    function (error, results, fields) {
      if (error) throw error;
      res.json(results);
    }
  );
})


// --------------------------------------------------
app.get('/projects/:id(\\d+)', function (req, res) {
  var id = req.params.id;
  console.log("/projects/" + id);
  getProject(id)
    .then(getDomainsForProject)
    .then(getInvestigatorsForProject)
    .then(getPublicationsForProject)
    .then(function (data) { res.json(data) });
})


// --------------------------------------------------
app.get('/projects', function (req, res) {
  console.log("/projects");
  getProjects()
    .then(getDomainsForProjects)
    .then(getInvestigatorsForProjects)
    .then( function (data) { res.json(data) }
  );
});


// --------------------------------------------------
app.get('/search/:query', function (req, res) {
  var query = req.params.query;
  console.log("/search/" + query);
  getSearchResults(query).then( (data) => res.json(data) );
});


// --------------------------------------------------
app.get('/samples/:id(\\d+)', function (req, res) {
  var id = req.params.id;
  console.log("/samples/" + id);
  getSample(id).then( (data) => res.json(data) ) ;
});


// --------------------------------------------------
app.get('/samples', function (req, res) {
  console.log("/samples");
  getSamples().then( (data) => res.json(data) ) ;
});


// --------------------------------------------------
app.get('/', function(req, res){
  var routes = app._router.stack        // registered routes
               .filter(r => r.route)    // take out all the middleware
               .map(r => r.route.path)
  res.json({ "routes": routes });
});


// --------------------------------------------------
//
// catch-all function
// 
app.get('*', function(req, res){
  res.status(404).send("Unknown route: " + req.path);
});


// --------------------------------------------------
app.listen(port, function () {
  console.log('Example app listening on port ' + port)
})


// --------------------------------------------------
function getProject(id) {
  return new Promise(function (resolve, reject) {
    connection.query(
      'select * from project where project_id=?', 
      [id],
      function (error, results, fields) {
        if (error) reject(error);
        if (results.length == 1) 
          resolve(results[0]);
        else 
          reject("Bad project id: " + id);
      }
    );
  });
}

// --------------------------------------------------
function getProjects() {
  return new Promise(function (resolve, reject) {
    connection.query(
      'select * from project',
      function (error, results, fields) {
        if (error) reject(error);
        resolve(results);
      }
    );
  });
}


// --------------------------------------------------
function getDomainsForProject(project) {
  return new Promise(function (resolve, reject) {
    connection.query(
      `
        select   d.domain_id, d.domain_name 
        from     domain d, project_to_domain p2d 
        where    p2d.project_id=? 
        and      p2d.domain_id=d.domain_id
        order by domain_name
      `,
      [project.project_id],
      function (error, results, fields) {
        if (error) return reject(err);
        project['domains'] = results;
        resolve(project);
      }
    );
  });
}


// --------------------------------------------------
function getDomainsForProjects(projects) {
  return Promise.all(projects.map(getDomainsForProject));
}


// --------------------------------------------------
function getInvestigatorsForProject(project) {
  return new Promise(function (resolve, reject) {
    connection.query(
      `
        select   i.investigator_id, i.investigator_name, i.institution
        from     project_to_investigator p2i, investigator i
        where    p2i.project_id=?
        and      p2i.investigator_id=i.investigator_id
        order by investigator_name
      `,
      [project.project_id],
      function (error, results, fields) {
        if (error) return reject(err);
        project['investigators'] = results;
        resolve(project);
      }
    );
  });
}


// --------------------------------------------------
function getInvestigatorsForProjects(projects) {
  return Promise.all(projects.map(getInvestigatorsForProject));
}


// --------------------------------------------------
function getPublicationsForProject(project) {
  return new Promise(function (resolve, reject) {
    connection.query(
      `
        select   p.publication_id, p.pub_code, p.doi,
                 p.author, p.title, p.pubmed_id, p.journal, p.pub_date
        from     publication p
        where    p.project_id=?
      `,
      [project.project_id],
      function (error, results, fields) {
        if (error) return reject(err);
        project['publications'] = results;
        resolve(project);
      }
    );
  });
}

// --------------------------------------------------
function getSample(id) {
  return new Promise(function (resolve, reject) {
    connection.query(
      `
        select s.sample_id, s.sample_acc, s.sample_name,
               s.sample_type, s.sample_description, s.comments,
               s.taxon_id, s.url, p.project_id, p.project_name
        from   sample s, project p
        where  s.sample_id=?
        and    s.project_id=p.project_id
      `,
      [id],
      function (error, results, fields) {
        if (error) reject(error);
        if (results.length == 1) 
          resolve(results[0]);
        else 
          reject("Bad sample id: " + id);
      }
    );
  });
}


// --------------------------------------------------
function getSearchResults(query) {
  return new Promise(function (resolve, reject) {
    connection.query(
      printf(
        `
        select table_name, primary_key as id, object_name as name
        from   search 
        where  match (search_text) against (%s in boolean mode)
        `,
        connection.escape(query)
      ),
      function (error, results, fields) {
        if (error) return reject(err);
        resolve(results);
      }
    );
  });
}


// --------------------------------------------------
/* FIXME desired query is below, file count was removed due to error
select  s.sample_id, s.sample_name, s.sample_type,
                   p.project_id, p.project_name,
                   s.latitude, s.longitude,
                   d.domain_name,
                   count(f.sample_file_id) as num_files
        from       sample s
        inner join project p
        on         s.project_id=p.project_id
        left join  sample_file f
        on         s.sample_id=f.sample_id
        left join  project_to_domain p2d
        on         p.project_id=p2d.project_id
        left join  domain d
        on         p2d.domain_id=d.domain_id

      ` select     s.sample_id, s.sample_name, s.sample_type,
                   p.project_id, p.project_name,
                   s.latitude, s.longitude,
                   d.domain_name
        from       sample s
        inner join project p
        on         s.project_id=p.project_id
        left join  project_to_domain p2d
        on         p.project_id=p2d.project_id
        left join  domain d
        on         p2d.domain_id=d.domain_id
      `,
*/
function getSamples() {
  return new Promise(function (resolve, reject) {
    connection.query(
      `
        select s.sample_id, s.sample_acc, s.sample_name,
               s.sample_type, s.sample_description, s.comments,
               s.taxon_id, s.url, p.project_id, p.project_name
        from   sample s, project p
        where  s.project_id=p.project_id
      `,
      function (error, results, fields) {
        if (error) throw error;
        resolve(results);
      }
    );
  });
}
