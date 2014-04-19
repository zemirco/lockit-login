
/**
 * Module dependencies.
 */

var express = require('express');
var favicon = require('static-favicon');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var cookieSession = require('cookie-session');
var bodyParser = require('body-parser');
var csrf = require('csurf');
var errorHandler = require('errorhandler');
var routes = require('./routes');
var user = require('./routes/user');
var http = require('http');
var path = require('path');
var lockitUtils = require('lockit-utils');
var Login = require('../../index.js');

function start(config) {

  config = config || require('./config.js');

  var app = express();

  // set basedir so views can properly extend layout.jade
  app.locals.basedir = __dirname + '/views';

  // all environments
  app.set('port', process.env.PORT || config.port || 3000);
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');
  // make JSON output simpler for testing
  app.set('json spaces', 0);

  app.use(favicon());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, 'public')));

  if (config.useSessionStore) {
    app.use(session({
      secret: 'this is my super secret string'
    }));
  } else {
    app.use(cookieSession({
      secret: 'this is my super secret string'
    }));
  }

  if (config.csrf) {
    app.use(csrf());
    app.use(function(req, res, next) {

      var token = req.csrfToken();
      res.locals._csrf = token;

      // save token to a cookie so we can easily access it on the client
      res.cookie('csrf', token);
      next();
    });
  }

  var db = lockitUtils.getDatabase(config);
  var adapter = require(db.adapter)(config);
  var login = new Login(config, adapter);

  app.use(login.router);

  // development only
  if ('development' == app.get('env')) {
    app.use(errorHandler());
  }

  app.get('/', routes.index);
  app.get('/users', user.list);

  // restrict routes to logged in users
  function restrict(req, res, next) {
    if (req.session.email && req.session.name) {
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

  http.createServer(app).listen(app.get('port'));

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
