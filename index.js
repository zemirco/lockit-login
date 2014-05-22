
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
 * Login constructor function.
 *
 * @constructor
 * @param {Object} config
 * @param {Object} adapter
 */
var Login = module.exports = function(config, adapter) {

  if (!(this instanceof Login)) return new Login(config, adapter);

  // call super constructor function
  events.EventEmitter.call(this);

  this.config = config;
  this.adapter = adapter;

  // set default routes
  this.loginRoute = config.login.route || '/login';
  var logoutRoute = config.login.logoutRoute || '/logout';

  // change URLs if REST is active
  if (config.rest) {
    this.loginRoute = '/rest' + this.loginRoute;
    logoutRoute = '/rest' + logoutRoute;
  }

  // two-factor authentication route
  this.twoFactorRoute = this.loginRoute + (config.login.twoFactorRoute || '/two-factor');

  var router = express.Router();
  router.get(this.loginRoute, this.getLogin.bind(this));
  router.post(this.loginRoute, this.postLogin.bind(this));
  router.post(this.twoFactorRoute, this.postTwoFactor.bind(this));
  router.get(logoutRoute, utils.restrict(config), this.getLogout.bind(this));
  this.router = router;

};

util.inherits(Login, events.EventEmitter);



/**
 * GET /login route handling function.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
Login.prototype.getLogin = function(req, res, next) {

  var config = this.config;
  var that = this;

  // do not handle the route when REST is active
  if (config.rest) return next();

  // save redirect url
  var suffix = req.query.redirect ? '?redirect=' + req.query.redirect : '';

  // custom or built-in view
  var view = config.login.views.login || join('get-login');

  // render view
  res.render(view, {
    title: 'Login',
    action: that.loginRoute + suffix,
    basedir: req.app.get('views')
  });
};



/**
 * POST /login route handling function.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
Login.prototype.postLogin = function(req, res, next) {

  var adapter = this.adapter;
  var config = this.config;
  var that = this;

  var error = '';

  var login = req.body.login;
  var password = req.body.password;

  // save redirect url
  var suffix = req.query.redirect ? '?redirect=' + req.query.redirect : '';

  // custom or built-in view
  var view = config.login.views.login || join('get-login');

  // check for valid inputs
  if (!login || !password) {
    error = 'Please enter your email/username and password';

    // send only JSON when REST is active
    if (config.rest) return res.json(403, {error: error});

    // render view
    res.status(403);
    res.render(view, {
      title: 'Login',
      action: that.loginRoute + suffix,
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
        action: that.loginRoute + suffix,
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
        action: that.loginRoute + suffix,
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
            action: that.loginRoute + suffix,
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

        // create session and save the name and email address
        req.session.name = user.name;
        req.session.email = user.email;

        // check if two-factor authentication is enabled
        if (!user.twoFactorEnabled) {

          // get redirect url
          var target = req.query.redirect || '/';

          // user is now logged in
          req.session.loggedIn = true;

          // emit 'login' event
          that.emit('login', user, res, target);

          // let lockit handle the response
          if (config.login.handleResponse) {
            // send only JSON when REST is active
            if (config.rest) return res.send(204);

            // redirect to target url
            res.redirect(target);
          }
          return;
        }

        // two-factor authentication is enabled

        // send only JSON when REST is active
        if (config.rest) return res.json({
          twoFactorEnabled: true
        });

        // custom or built-in view
        var view = config.login.views.twoFactor || join('two-factor');

        // render two-factor authentication template
        res.render(view, {
          title: 'Two-factor authentication',
          action: that.twoFactorRoute,
          basedir: req.app.get('views')
        });

      });

    });

  });

};



/**
 * POST /login/two-factor.
 *
 * Verify provided token using time-based one-time password.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
Login.prototype.postTwoFactor = function(req, res, next) {

  var config = this.config;
  var adapter = this.adapter;
  var loginRoute = this.loginRoute;
  var that = this;

  var token = req.body.token || '';
  var email = req.session.email || '';

  // get redirect url
  var target = req.query.redirect || '/';

  // get user from db
  adapter.find('email', email, function(err, user) {
    if (err) return next(err);

    var key = user && user.twoFactorKey;

    // verify POSTed token
    var valid = utils.verify(token, key);

    // redirect to /login if invalid
    if (!valid) {
      // destroy current session
      return utils.destroy(req, function() {
        // send only JSON when REST is active
        if (config.rest) return res.send(401);
        res.redirect(loginRoute + '?redirect=' + target);
      });
    }

    // token seems to be fine

    // user is now logged in
    req.session.loggedIn = true;

    // emit 'login' event
    that.emit('login', user, res, target);

    // let lockit handle the response
    if (config.login.handleResponse) {
      // send only JSON when REST is active
      if (config.rest) return res.send(204);

      // redirect to target url
      res.redirect(target);
    }

  });

};



/**
 * GET /logout route handling function.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Function} next
 */
Login.prototype.getLogout = function(req, res, next) {

  var config = this.config;
  var that = this;

  // save values for event emitter
  var user = {
    name: req.session.name,
    email: req.session.email
  };

  // destroy the session
  utils.destroy(req, function() {
    // clear local variables - they were set before the session was destroyed
    res.locals.name = null;
    res.locals.email = null;

    // emit 'logout' event
    that.emit('logout', user, res);

    // let lockit handle the response
    if (config.login.handleResponse) {

      // send JSON when REST is active
      if (config.rest) return res.send(204);

      // custom or built-in view
      var view = config.login.views.loggedOut || join('get-logout');

      // reder logout success template
      res.render(view, {
        title: 'Logout successful',
        basedir: req.app.get('views')
      });

    }
  });

};
