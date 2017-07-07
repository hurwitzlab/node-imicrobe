const express = require('express')
const app = express()
const port = 3006;

var mysql = require('mysql');
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'kyclark',
    password : 'L1ttlecrobes.',
    database : 'imicrobe'
});

app.get('/', function (req, res) {
  connection.connect();

  connection.query('SELECT * from investigators', 
    function (error, results, fields) {
      if (error) throw error;
      res.send(results);
    }
  );

  connection.end();
})

app.listen(port, function () {
  console.log('Example app listening on port ' + port)
})
