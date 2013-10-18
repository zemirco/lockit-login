
var path = require('path');
var bcrypt = require('bcrypt');

module.exports = function(app, config) {
  
  // load additional modules
  var adapter = require('lockit-' + config.db + '-adapter')(config);

  // GET /login
  app.get('/login', function(req, res) {
    res.render(path.join(__dirname, 'views', 'get-login'), {
      title: 'Login'
    });
  });
  
  // POST /login
  app.post('/login', function(req, res, next) {
    
    // session might include a url which the user requested before login
    var target = req.session.redirectUrlAfterLogin || '/';

    // reset the session
    delete req.session.redirectUrlAfterLogin;
    
    var login = req.body.login;
    var password = req.body.password;

    // check for valid inputs
    if (!login || !password) {
      res.status(403);
      res.render(path.join(__dirname, 'views', 'get-login'), {
        title: 'Login',
        error: 'Please enter your email/username and password'
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
        res.status(403);
        res.render(path.join(__dirname, 'views', 'get-login'), {
          title: 'Login',
          error: 'Invalid user or password'
        });
        return;
      }

      // check for too many failed login attempts
      if (user.accountLocked && new Date(user.accountLockedUntil) > new Date()) {
        res.status(403);
        res.render(path.join(__dirname, 'views', 'get-login'), {
          title: 'Login',
          error: 'The account is temporarily locked'
        });
        return;
      }

      // compare hash with hash from db
      bcrypt.compare(password, user.hash, function(err, valid) {
        if (err) console.log(err);
        
        if (!valid) {

          // set the default error message
          var errorMessage = 'Invalid user or password';

          // increase failed login attempts
          user.failedLoginAttempts += 1;

          // lock account on too many login attempts (defaults to 5)
          if (user.failedLoginAttempts >= config.failedLoginAttempts) {
            user.accountLocked = true;

            // set locked time to 20 minutes (default value)
            var current = new Date();
            var twentyMinutes = current.setTime(current.getTime() + config.accountLockedTime);
            user.accountLockedUntil = new Date(twentyMinutes);

            errorMessage = 'Invalid user or password. Your account is now locked for 20 minutes.';
          } else if (user.failedLoginAttempts >= config.failedLoginsWarning) {
            // show a warning after 3 (default setting) failed login attempts
            errorMessage = 'Invalid user or password. Your account will be locked soon.';
          }

          // save user to db
          adapter.update(user, function(err, user) {
            if (err) console.log(err);

            // send error message
            res.status(403);
            res.render(path.join(__dirname, 'views', 'get-login'), {
              title: 'Login',
              error: errorMessage
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
        user.currentLoginTime = new Date();
        user.currentLoginIp = req.ip;
        
        // set failed login attempts to zero
        user.failedLoginAttempts = 0;
        user.accountLocked = false;
        
        // save user to db
        adapter.update(user, function(err, user) {
          if (err) console.log(err);

          // create session and save the username
          req.session.username = user.username;
          req.session.email = user.email;
          res.redirect(target);
        });
        
      });
      
    });
    
  });
  
  // GET /logout
  app.get('/logout', function(req, res) {

    // destroy the session
    req.session = null;

    // reder logout success template
    res.render(path.join(__dirname, 'views', 'get-logout'), {
      title: 'Logout successful'
    });

  });
  
};