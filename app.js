const express = require('express')
const app = express()
const port = 3006;
var cors = require('cors')
var Promise = require('promise');
var config = require('./config.json');

app.use(cors())

// --------------------------------------------------
var mysql = require('mysql');
var connection = mysql.createConnection(config.mysql);

// --------------------------------------------------
app.get('/investigators/:id(\\d+)', function (req, res) {
  id = req.params.id;
  console.log("/investigators/" + id);
  connection.query(
    'SELECT * from investigator where investigator_id=?', 
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
  var sql = `
    select   investigator_id, investigator_name, 
             institution
    from     investigator 
    order by investigator_name
  `;

  connection.query(
    sql,
    function (error, results, fields) {
      if (error) throw error;
      res.json(results);
    }
  );
})

// --------------------------------------------------
app.get('/projects/:id(\\d+)', function (req, res) {
  id = req.params.id;
  console.log("/investigators/" + id);
  connection.query(
    'SELECT * from project where project_id=?', 
    [id],
    function (error, results, fields) {
      if (error) throw error;
      if (results.length == 1) {
        res.json(results[0]);
      }
      else {
        res.status(404).send("Bad project id: " + id);
      }
    }
  );
})

// --------------------------------------------------
app.get('/projects', function (req, res) {
  console.log("/projects");
  getProjects().then(getDomains).then(getInvestigators).then(
    function (data) { res.json(data) }
  );
});

// --------------------------------------------------
app.get('/samples', function (req, res) {
  console.log("/samples");
  getSamples().then( (data) => res.json(data) ) ;
});

// --------------------------------------------------
app.get('*', function(req, res){
  res.status(404).send("Unknown route: " + req.path);
});

// --------------------------------------------------
app.listen(port, function () {
  console.log('Example app listening on port ' + port)
})

// --------------------------------------------------
function getProjects() {
  return new Promise(function (resolve, reject) {
    connection.query(
      'SELECT * from project',
      function (error, results, fields) {
        if (error) throw error;
        resolve(results);
      }
    );
  });
}

// --------------------------------------------------
function getDomains(projects) {
  var sql = `
    select   d.domain_id, d.domain_name 
    from     domain d, project_to_domain p2d 
    where    p2d.project_id=? 
    and      p2d.domain_id=d.domain_id
    order by domain_name
  `;

  f = function (project) {
    return new Promise(function (resolve, reject) {
      connection.query(
        sql,
        [project.project_id],
        function (error, results, fields) {
          if (error) return reject(err);
          project['domains'] = results;
          resolve(project);
        }
      );
    });
  }
  return Promise.all(projects.map(f));
}

// --------------------------------------------------
function getInvestigators(projects) {
  var sql = `
    select   i.investigator_id, i.investigator_name, i.institution
    from     project_to_investigator p2i, investigator i
    where    p2i.project_id=?
    and      p2i.investigator_id=i.investigator_id
    order by investigator_name
  `;

  f = function (project) {
    return new Promise(function (resolve, reject) {
      connection.query(
        sql,
        [project.project_id],
        function (error, results, fields) {
          if (error) return reject(err);
          project['investigators'] = results;
          resolve(project);
        }
      );
    });
  }
  return Promise.all(projects.map(f));
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
*/
function getSamples() {
  return new Promise(function (resolve, reject) {
    connection.query(
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
      function (error, results, fields) {
        if (error) throw error;
        resolve(results);
      }
    );
  });
}