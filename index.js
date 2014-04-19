
var path = require('path');
var events = require('events');
var util = require('util');
var express = require('express');
var ms = require('ms');
var moment = require('moment');
var utils = require('lockit-utils');
var pwd = require('couch-pwd');

/**
 * Internal helper functions
 */

function join(view) {
  return path.join(__dirname, 'views', view);
}

/**
 * Let's get serious
 */

var Login = module.exports = function(config, adapter) {

  if (!(this instanceof Login)) return new Login(config, adapter);

  // call super constructor function
  events.EventEmitter.call(this);

  var that = this;

  // shorten config
  var cfg = config.login;

  // set default routes
  var loginRoute = cfg.route || '/login';
  var logoutRoute = cfg.logoutRoute || '/logout';

  // change URLs if REST is active
  if (config.rest) {
    loginRoute = '/rest' + loginRoute;
    logoutRoute = '/rest' + logoutRoute;
  }

  /**
   * Routes
   */

  var router = express.Router();
  router.get(loginRoute, getLogin);
  router.post(loginRoute, postLogin);
  router.get(logoutRoute, utils.restrict(config), getLogout);
  this.router = router;

  /**
   * Route handlers
   */

    // GET /login
  function getLogin(req, res, next) {
    // do not handle the route when REST is active
    if (config.rest) return next();

    // save redirect url in session
    req.session.redirectUrlAfterLogin = req.query.redirect;

    // custom or built-in view
    var view = cfg.views.login || join('get-login');

    // render view
    res.render(view, {
      title: 'Login',
      basedir: req.app.get('views')
    });
  }

  // POST /login
  function postLogin(req, res, next) {

    var error = '';

    // session might include a url which the user requested before login
    var target = req.session.redirectUrlAfterLogin || '/';

    var login = req.body.login;
    var password = req.body.password;

    // custom or built-in view
    var view = cfg.views.login || join('get-login');

    // check for valid inputs
    if (!login || !password) {
      error = 'Please enter your email/username and password';

      // send only JSON when REST is active
      if (config.rest) return res.json(403, {error: error});

      // render view
      res.status(403);
      res.render(view, {
        title: 'Login',
        error: error,
        login: login,
        basedir: req.app.get('views')
      });
      return;
    }

    // check if login is a name or an email address

    // regexp from https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L4
    var EMAIL_REGEXP = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$/;
    var query = EMAIL_REGEXP.test(login) ? 'email' : 'name';

    // find user in db
    adapter.find(query, login, function(err, user) {
      if (err) return next(err);

      // no user or user email isn't verified yet -> render error message
      if (!user || !user.emailVerified) {
        error = 'Invalid user or password';

        // send only JSON when REST is active
        if (config.rest) return res.json(403, {error: error});

        // render view
        res.status(403);
        res.render(view, {
          title: 'Login',
          error: error,
          login: login,
          basedir: req.app.get('views')
        });
        return;
      }

      // check for too many failed login attempts
      if (user.accountLocked && new Date(user.accountLockedUntil) > new Date()) {
        error = 'The account is temporarily locked';

        // send only JSON when REST is active
        if (config.rest) return res.json(403, {error: error});

        // render view
        res.status(403);
        res.render(view, {
          title: 'Login',
          error: error,
          login: login,
          basedir: req.app.get('views')
        });
        return;
      }

      // if user comes from couchdb it has an 'iterations' key
      if (user.iterations) pwd.iterations(user.iterations);

      // compare credentials with data in db
      pwd.hash(password, user.salt, function(err, hash) {
        if (err) return next(err);

        if (hash !== user.derived_key) {
          // set the default error message
          var errorMessage = 'Invalid user or password';

          // increase failed login attempts
          user.failedLoginAttempts += 1;

          // lock account on too many login attempts (defaults to 5)
          if (user.failedLoginAttempts >= config.failedLoginAttempts) {
            user.accountLocked = true;

            // set locked time to 20 minutes (default value)
            var timespan = ms(config.accountLockedTime);
            user.accountLockedUntil = moment().add(timespan, 'ms').toDate();

            errorMessage = 'Invalid user or password. Your account is now locked for ' + config.accountLockedTime;
          } else if (user.failedLoginAttempts >= config.failedLoginsWarning) {
            // show a warning after 3 (default setting) failed login attempts
            errorMessage = 'Invalid user or password. Your account will be locked soon.';
          }

          // save user to db
          adapter.update(user, function(err, user) {
            if (err) return next(err);

            // send only JSON when REST is active
            if (config.rest) return res.json(403, {error: errorMessage});

            // send error message
            res.status(403);
            res.render(view, {
              title: 'Login',
              error: errorMessage,
              login: login,
              basedir: req.app.get('views')
            });
          });

          return;

        }

        // looks like password is correct

        // shift tracking values
        var now = new Date();

        // update previous login time and ip
        user.previousLoginTime = user.currentLoginTime || now;
        user.previousLoginIp = user.currentLoginIp || req.ip;

        // save login time
        user.currentLoginTime = now;
        user.currentLoginIp = req.ip;

        // set failed login attempts to zero but save them in the session
        req.session.failedLoginAttempts = user.failedLoginAttempts;
        user.failedLoginAttempts = 0;
        user.accountLocked = false;

        // save user to db
        adapter.update(user, function(err, user) {
          if (err) return next(err);

          // reset the session
          delete req.session.redirectUrlAfterLogin;

          // create session and save the name and email address
          req.session.name = user.name;
          req.session.email = user.email;

          // emit 'login' event
          that.emit('login', user, res, target);

          // let lockit handle the response
          if (cfg.handleResponse) {
            // send only JSON when REST is active
            if (config.rest) return res.send(204);

            // redirect to target url
            res.redirect(target);
          }

        });

      });

    });
  }

  // GET /logout
  // GET /rest/logout when REST is active
  function getLogout(req, res, next) {

    // save values for event emitter
    var user = {
      name: req.session.name,
      email: req.session.email
    };

    // destroy the session
    if (req.sessionStore) {
      req.session.destroy(done);
    } else {
      req.session = null;
      done();
    }

    function done() {
      // clear local variables - they were set before the session was destroyed
      res.locals.name = null;
      res.locals.email = null;

      // emit 'logout' event
      that.emit('logout', user, res);

      // let lockit handle the response
      if (cfg.handleResponse) {

        // send JSON when REST is active
        if (config.rest) return res.send(204);

        // custom or built-in view
        var view = cfg.views.loggedOut || join('get-logout');

        // reder logout success template
        res.render(view, {
          title: 'Logout successful',
          basedir: req.app.get('views')
        });

      }
    }

  }

};

util.inherits(Login, events.EventEmitter);
