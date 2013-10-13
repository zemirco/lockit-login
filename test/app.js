
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');

var login = require('../index.js');

function start(config) {

  config = config || require('./config.js');

  var app = express();

  // set basedir so views can properly extend layout.jade
  app.locals.basedir = __dirname + '/views';

// all environments
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('your secret here'));
  app.use(express.cookieSession());

  // use forgot password middleware with testing options
  login(app, config);

  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));

// development only
  if ('development' == app.get('env')) {
    app.use(express.errorHandler());
  }

  app.get('/', routes.index);
  app.get('/users', user.list);

  // restrict routes to logged in users
  function restrict(req, res, next) {
    if (req.session.email && req.session.username) {
      next();
    } else {
      // redirect to login page but save url the user really wanted to visit
      var url = req.url;
      // save original url to session
      req.session.redirectUrlAfterLogin = url;
      res.redirect('/login');
    }
  }

  // dummy route for testing redirection after login
  app.get('/test', restrict, function(req, res) {
    res.send('well done');
  });

  http.createServer(app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
  });

  return app;

}

// export app for testing
if(require.main === module){
  // called directly
  start();
} else {
  // required as a module -> from test file
  module.exports = function(config) {
    return start(config);
  };
}