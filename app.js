const express = require('express')
const app = express()
const port = 3006;
var cors = require('cors')

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
  connection.query('SELECT * from investigator', 
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
  connection.query('SELECT * from project', 
    function (error, results, fields) {
      if (error) throw error;
      for (i = 0; i < results.length; i++) {
        results[i].domains = get_domains(results[i].project_id);
      }
      res.json(results);
    }
  );
})

// --------------------------------------------------
function get_domains(project_id) {
  sql = 'select d.domain_name '
      + 'from domain d, project_to_domain p2d '
      + 'where p2d.project_id=? '
      + 'and p2d.domain_id=d.domain_id';

  connection.query(sql, [project_id], function (error, results, fields) {
    if (error) throw error;
    return results.map(function (o) { return o['domain_name'] });
  });
}

// --------------------------------------------------
app.get('*', function(req, res){
  res.status(404).send("Unknown route: " + req.path);
});

// --------------------------------------------------
app.listen(port, function () {
  console.log('Example app listening on port ' + port)
})
