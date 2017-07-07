const express = require('express')
const app = express()

app.get('/', function (req, res) {
  var i = 5;
  res.send({ msg: 'Hello World!', num : i })
})

app.listen(3000, function () {
  console.log('Example app listening on port 3000!')
})
