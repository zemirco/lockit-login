
var request = require('supertest');
var should = require('should');
var superagent = require('superagent');
var utls = require('lockit-utils');

var config = require('./config.js');
var app = require('./app.js')(config);

var db = utls.getDatabase(config);
var adapter = require(db.adapter)(config);

// create a second app for testing custom view
var altConfig = JSON.parse(JSON.stringify(config));

// set some custom properties
altConfig.port = 4000;
altConfig.login.views = {
  login: 'custom/login',
  loggedOut: 'custom/loggedOut'
};

var altApp = require('./app.js')(altConfig);

// create third app for testing REST
var config_3 = JSON.parse(JSON.stringify(config));
config_3.rest = true;
config_3.port = 5000;
var app_3 = require('./app.js')(config_3);

before(function(done) {
  // add a dummy user to db - email isn't verified yet
  adapter.save('john', 'john@email.com', 'password', function(err, user) {
    if (err) console.log(err);
    
    // add another dummy user and verify email
    adapter.save('steve', 'steve@email.com', 'password', function(err, user) {
      if (err) console.log(err);

      // verify email for steve
      adapter.find('username', 'steve', function(err, user) {
        if (err) console.log(err);

        user.emailVerified = true;

        // save updated user to db
        adapter.update(user, function(err, user) {
          if (err) console.log(err);
          
          // create another use for REST testing
          adapter.save('beep', 'beep@email.com', 'password', function(err, user) {
            // verify email for steve
            adapter.find('username', 'beep', function(err, user) {
              user.emailVerified = true;
              // save updated user to db
              adapter.update(user, function(err, user) {
                done();
              });
            });
          });
        });

      });


    });
  });
});

var agent = null;

// simple wrapper for POSTing stuff again and again
function postLogin(username, pass, cb) {
  request(app)
    .post('/login')
    .send({login: username, password: pass})
    .end(cb);
}

describe('lockit-login', function() {

  describe('GET /login', function() {

    it('should render the login page', function(done) {
      request(app)
        .get('/login')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.text.should.include('Email or Username');
          res.text.should.include('<title>Login</title>');
          done();
        });
    });

    it('should use the custom template', function(done) {
      request(altApp)
        .get('/login')
        .end(function(err, res) {
          res.text.should.include('Join the community');
          done();
        });
    });

    it('should not catch the route when REST is active', function(done) {
      request(app_3)
        .get('/rest/login')
        .end(function(err, res) {
          res.text.should.include('Cannot GET /rest/login');
          done();
        });
    });

  });

  describe('POST /login', function() {

    it('should render an error message when login field is invalid', function(done) {
      postLogin('', 'secret', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.include('Please enter your email/username and password');
        done();
      });
    });

    it('should send a JSON error message when login field is invalid', function(done) {
      request(app_3)
        .post('/rest/login')
        .send({login: '', password: 'secret'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Please enter your email/username and password"}');
          done();
        });
    });

    it('should render an error message when password field is empty', function(done) {
      postLogin('john', '', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.include('Please enter your email/username and password');
        done();
      });
    });

    it('should send a JSON error message when password field is empty', function(done) {
      request(app_3)
        .post('/rest/login')
        .send({login: 'john', password: ''})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Please enter your email/username and password"}');
          done();
        });
    });

    it('should render an error message when email is not verified', function(done) {
      postLogin('john', 'password', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.include('Invalid user or password');
        done();
      });
    });

    it('should send a JSON error message when email is not verified', function(done) {
      request(app_3)
        .post('/rest/login')
        .send({login: 'john', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Invalid user or password"}');
          done();
        });
    });

    it('should render an error message when user is not in db', function(done) {
      postLogin('jack', 'password', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.include('Invalid user or password');
        done();
      });
    });

    it('should render a JSON error message when user is not in db', function(done) {
      request(app_3)
        .post('/rest/login')
        .send({login: 'jack', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Invalid user or password"}');
          done();
        });
    });

    it('should render an error message when password is false', function(done) {
      postLogin('john', 'something', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.include('Invalid user or password');
        done();
      });
    });

    it('should render a JSON error message when password is false', function(done) {
      request(app_3)
        .post('/rest/login')
        .send({login: 'john', password: 'something'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Invalid user or password"}');
          done();
        });
    });

    it('should show a warning message after three failed login attempts', function(done) {

      // three login attempts
      postLogin('steve', 'wrong', function(err, res) {
        postLogin('steve', 'wrong', function(err, res) {
          postLogin('steve', 'wrong', function(err, res) {
            res.statusCode.should.equal(403);
            res.text.should.include('Invalid user or password. Your account will be locked soon.');
            done();
          });
        });
      });

    });

    it('should show a JSON error after three failed login attempts', function(done) {
      
      // don't use "steve" again as account will get locked
      request(app_3)
        .post('/rest/login')
        .send({login: 'beep', password: 'wrong'})
        .end(function(err, res) {
          request(app_3)
            .post('/rest/login')
            .send({login: 'beep', password: 'wrong'})
            .end(function(err, res) {
              request(app_3)
                .post('/rest/login')
                .send({login: 'beep', password: 'wrong'})
                .end(function(err, res) {
                  res.statusCode.should.equal(403);
                  res.text.should.equal('{"error":"Invalid user or password. Your account will be locked soon."}');
                  done();
                });
            });
        });
    });

    it('should lock the account after five failed login attempts', function(done) {

      // two more login attempts
      postLogin('steve', 'wrong', function(err, res) {
        postLogin('steve', 'wrong', function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.include('Invalid user or password. Your account is now locked for ' + config.accountLockedTime);
          done();
        });
      });

    });

    it('should lock the account after five failed login attempts (REST)', function(done) {

      // two more login attempts
      request(app_3)
        .post('/rest/login')
        .send({login: 'beep', password: 'wrong'})
        .end(function(err, res) {
          request(app_3)
            .post('/rest/login')
            .send({login: 'beep', password: 'wrong'})
            .end(function(err, res) {
              res.statusCode.should.equal(403);
              res.text.should.equal('{"error":"Invalid user or password. Your account is now locked for ' + config.accountLockedTime + '"}');
              done();
            });
        });

    });

    it('should not allow login with a locked user account', function(done) {
      postLogin('steve', 'wrong', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.include('The account is temporarily locked');
        done();
      });
    });

    it('should not allow login with a locked user account (REST)', function(done) {
      request(app_3)
        .post('/rest/login')
        .send({login: 'beep', password: 'wrong'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"The account is temporarily locked"}');
          done();
        });
    });

    it('should enable a locked account after certain amount of time', function(done) {

      // time is 5s in config
      setTimeout(function() {
        postLogin('steve', 'wrong', function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.include('Invalid user or password');
          done();
        });
      }, 5000);
    });

    it('should enable a locked account after certain amount of time (REST)', function(done) {

      request(app_3)
        .post('/rest/login')
        .send({login: 'beep', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          done();
        });
    });

    it('should allow login in with a username', function(done) {

      // verify email address before making the request
      adapter.find('username', 'john', function(err, user) {
        if (err) console.log(err);

        // verify email manually
        user.emailVerified = true;

        // save updated user to db
        adapter.update(user, function(err, user) {
          if (err) console.log(err);

            // now make the request
            postLogin('john', 'password', function(err, res) {
              // test for proper redirection
              res.statusCode.should.equal(302);
              res.header.location.should.include('/');
              done();
            });
        });

      });

    });

    it('should allow login in with a username (REST)', function(done) {

      request(app_3)
        .post('/rest/login')
        .send({login: 'john', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          done();
        });

    });

    it('should allow login in with an email', function(done) {

      // we don't have to verify the email address as it is done by the test before
      postLogin('john@email.com', 'password', function(err, res) {
        // test for proper redirection
        res.statusCode.should.equal(302);
        res.header.location.should.include('/');
        done();
      });
    });

    it('should allow login in with an email (REST)', function(done) {

      request(app_3)
        .post('/rest/login')
        .send({login: 'john@email.com', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          done();
        });
    });

    it('should redirect to the main page when no redirect was necessary', function(done) {
      postLogin('john', 'password', function(err, res) {
        // test for proper redirection
        res.statusCode.should.equal(302);
        res.header.location.should.include('/');
        done();
      });
    });

    it('should redirect to the originally requested page', function(done) {

      // use superagent for persistent sessions
      var url = config.url;
      agent = superagent.agent();

      // request our /test page which is restricted - redirection is a bit different for superagent
      agent
        .get(url + '/test')
        .end(function(err, res) {
          // test for proper redirection
          res.statusCode.should.equal(200);
          res.redirects.should.eql(['http://localhost:3000/login']);

          // now login
          agent
            .post(url + '/login')
            .send({login:'john', password:'password'})
            .end(function(err, res) {
              res.statusCode.should.equal(200);
              res.redirects.should.eql(['http://localhost:3000/test']);
              done();
            });

        });

    });

    it('should work with custom views', function(done) {
      request(altApp)
        .post('/login')
        .send({login: '', password: 'scret'})
        .end(function(err, res) {
          res.text.should.include('Join the community');
          done();
        });
    });

  });

  describe('GET /logout', function() {

    var agent = superagent.agent();

    it('should start with login', function(done) {
      agent
        .post(config.url + '/login')
        .send({login:'john', password:'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.redirects.should.eql(['http://localhost:3000/']);
          done();
        });
    });

    it('should then allow access to restricted pages', function(done) {
      agent
        .get(config.url + '/test')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.text.should.include('well done');
          done();
        });
    });

    it('should render a success message and destroy the session', function(done) {
      agent
        .get(config.url + '/logout')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.text.should.include('You\'ve successfully logged out.');
          done();
        });
    });

    it('should then disallow access to restricted pages', function(done) {
      agent
        .get(config.url + '/test')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.redirects.should.eql(['http://localhost:3000/login']);
          done();
        });
    });

    it('should work with custom views', function(done) {
      
        // login first
        agent
          .post('http://localhost:4000/login')
          .send({login:'john', password:'password'})
          .end(function(err, res) {

              // then logout
              agent
                .get('http://localhost:4000/logout')
                .end(function(err, res) {
                  if (err) console.log(err);
                  res.text.should.include('You did it!');
                  done();
                });
              
          });
      
    });

    it('should only send the status code if REST is active', function(done) {

      // login first
      agent
        .post('http://localhost:4000/login')
        .send({login:'john', password:'password'})
        .end(function(err, res) {

          // then logout
          agent
            .get('http://localhost:5000/rest/logout')
            .end(function(err, res) {
              res.statusCode.should.equal(200);
              done();
            });

        });

    });

  });

});

// remove user from db
after(function(done) {

  adapter.remove('username', 'john', function(err) {
    if (err) console.log(err);
    adapter.remove('username', 'steve', function(err) {
      if (err) console.log(err);
      adapter.remove('username', 'beep', function(err) {
        if (err) console.log(err);
        done();
      });
    });
  });

});