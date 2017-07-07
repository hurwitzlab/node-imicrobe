const express = require('express')
const app = express()
const port = 3006;

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
  var id = req.params.id;

  connection.query('SELECT * from investigator where investigator_id=?', [id], 
    function (error, results, fields) {
      if (error) throw error;
      res.send(results);
    }
  );
})

// --------------------------------------------------
app.get('/investigators', function (req, res) {
  connection.query('SELECT * from investigator', 
    function (error, results, fields) {
      if (error) throw error;
      res.send(results);
    }
  );
})

// --------------------------------------------------
app.get('/projects/:id(\\d+)', function (req, res) {
  connection.query('SELECT * from project where project_id=?', [req.params.id],
    function (error, results, fields) {
      if (error) throw error;
      res.send(results);
    }
  );
})

// --------------------------------------------------
app.get('/projects', function (req, res) {
  connection.query('SELECT * from project', 
    function (error, results, fields) {
      if (error) throw error;
      res.send(results);
    }
  );
})

// --------------------------------------------------
app.listen(port, function () {
  console.log('Example app listening on port ' + port)
})
