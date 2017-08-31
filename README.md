# node-imicrobe

This is a rewrite of [imicrobe-mojo](https://github.com/hurwitzlab/imicrobe-mojo) using Node.js.

To try out:
```
npm install
npm start
```

For development:
```
npm install nodemon
nodemon server.js
```

For production:
```
sudo npm install pm2@latest -g
pm2 start server.js
sudo pm2 startup systemd
```

# Authors

Ken Youens-Clark

Matt Bomhoff
