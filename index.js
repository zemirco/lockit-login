
var path = require('path');
var bcrypt = require('bcrypt');
var ms = require('ms');
var moment = require('moment');
var debug = require('debug')('lockit-login');
var utils = require('lockit-utils');

// require event emitter
var events = require('events');
var util = require('util');

/**
 * Internal helper functions
 */

function join(view) {
  return path.join(__dirname, 'views', view);
}

/**
 * Let's get serious
 */

var Login = module.exports = function(app, config) {

  if (!(this instanceof Login)) {
    return new Login(app, config);
  }
  
  var that = this;

  var db = utils.getDatabase(config);

  // load additional modules
  var adapter = require(db.adapter)(config);

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

  app.get(loginRoute, getLogin);
  app.post(loginRoute, postLogin);
  app.get(logoutRoute, utils.restrict(config), getLogout);

  /**
   * Route handlers
   */

    // GET /login
  function getLogin(req, res, next) {
    debug('rendering GET %s', loginRoute);

    // do not handle the route when REST is active
    if (config.rest) return next();

    // save redirect url in session
    req.session.redirectUrlAfterLogin = req.query.redirect;

    // custom or built-in view
    var view = cfg.views.login || join('get-login');

    // render view
    res.render(view, {
      title: 'Login'
    });
  }

  // POST /login  
  function postLogin(req, res) {
    debug('POST request to %s: %j', loginRoute, req.body);

    var error = '';

    // session might include a url which the user requested before login
    var target = req.session.redirectUrlAfterLogin || '/';
    debug('redirect target is: %s', target);

    var login = req.body.login;
    var password = req.body.password;

    // custom or built-in view
    var view = cfg.views.login || join('get-login');

    // check for valid inputs
    if (!login || !password) {
      debug('invalid inputs');
      error = 'Please enter your email/username and password';

      // send only JSON when REST is active
      if (config.rest) return res.json(403, {error: error});

      // render view
      res.status(403);
      res.render(view, {
        title: 'Login',
        error: error,
        login: login
      });
      return;
    }

    // check if login is a username or an email address

    // regexp from https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L4
    var EMAIL_REGEXP = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$/;
    var query = EMAIL_REGEXP.test(login) ? 'email' : 'username';

    // find user in db
    adapter.find(query, login, function(err, user) {
      if (err) console.log(err);

      // no user or user email isn't verified yet -> render error message
      if (!user || !user.emailVerified) {
        debug('no user found');
        error = 'Invalid user or password';

        // send only JSON when REST is active
        if (config.rest) return res.json(403, {error: error});

        // render view
        res.status(403);
        res.render(view, {
          title: 'Login',
          error: error,
          login: login
        });
        return;
      }

      // check for too many failed login attempts
      if (user.accountLocked && new Date(user.accountLockedUntil) > new Date()) {
        debug('too many failed login attempts');
        error = 'The account is temporarily locked';

        // send only JSON when REST is active
        if (config.rest) return res.json(403, {error: error});

        // render view
        res.status(403);
        res.render(view, {
          title: 'Login',
          error: error,
          login: login
        });
        return;
      }

      // compare hash with hash from db
      bcrypt.compare(password, user.hash, function(err, valid) {
        if (err) console.log(err);

        if (!valid) {
          debug('invalid password');
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
            if (err) console.log(err);

            // send only JSON when REST is active
            if (config.rest) return res.json(403, {error: errorMessage});

            // send error message
            res.status(403);
            res.render(view, {
              title: 'Login',
              error: errorMessage,
              login: login
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
          debug('updated user: %j', user);
          if (err) console.log(err);

          // reset the session
          delete req.session.redirectUrlAfterLogin;

          // create session and save the username and email address
          req.session.username = user.username;
          req.session.email = user.email;
          
          // emit 'login' event
          that.emit('login', user, res, target);
          
          // let lockit handle the response
          if (cfg.handleResponse) {
            // send only JSON when REST is active
            if (config.rest) return res.send(200);

            // redirect to target url
            res.redirect(target);
          }
          
        });

      });

    });
  }

  // GET /logout
  // GET /rest/logout when REST is active  
  function getLogout(req, res) {
    debug('rendering GET %s', logoutRoute);
    
    // save values for event emitter
    var user = {
      username: req.session.username,
      email: req.session.email
    };
    
    // destroy the session
    req.session = null;

    // clear local variables - they were set before the session was destroyed
    res.locals.username = null;
    res.locals.email = null;

    // emit 'logout' event
    that.emit('logout', user, res);
    
    // let lockit handle the response
    if (cfg.handleResponse) {

      // send JSON when REST is active
      if (config.rest) return res.send(200);

      // custom or built-in view
      var view = cfg.views.loggedOut || join('get-logout');

      // reder logout success template
      res.render(view, {
        title: 'Logout successful'
      });
      
    }

  }
  
  events.EventEmitter.call(this);
  
};

util.inherits(Login, events.EventEmitter);