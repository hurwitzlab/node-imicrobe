const express = require('express')
const app = express()
const port = 3006;
var cors = require('cors')
var Promise = require('promise');
var printf = require('printf');

app.use(cors())


// --------------------------------------------------
var mysql = require('mysql');
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'kyclark',
    password : 'g0p3rl!',
    database : 'imicrobe'
});


// --------------------------------------------------
app.get('/investigators/:id(\\d+)', function (req, res) {
  id = req.params.id;
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
  id = req.params.id;
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
  getSearchResults(query)
    .then( function (data) { res.json(data) }
  );
});


// --------------------------------------------------
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
function getSearchResults(query) {
  return new Promise(function (resolve, reject) {

    connection.query(
      printf(
        `
        select search_id, table_name, primary_key, search_text 
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
