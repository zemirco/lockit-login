
var request = require('supertest');
var should = require('should');
var superagent = require('superagent');
var utils = require('lockit-utils');
var totp = require('notp').totp;

var config = require('./app/config.js');
var app = require('./app/app.js');

var db = utils.getDatabase(config);
var adapter = require(db.adapter)(config);
var _app = app(config);

describe('# default config', function() {

  before(function(done) {
    // create user 'john' - email not verified
    adapter.save('john', 'john@email.com', 'password', function(err, user) {
      // add another dummy user and verify email
      adapter.save('steve', 'steve@email.com', 'password', function(err, user) {
        // verify email for steve
        adapter.find('name', 'steve', function(err, user) {
          user.emailVerified = true;
          // save updated user to db
          adapter.update(user, function(err, user) {
            // create another user for two factor auth
            adapter.save('tf', 'tf@email.com', 'twofactor', function(err, user) {
              // verify email and enable two-factor auth for tf
              adapter.find('name', 'tf', function(err, user) {
                user.emailVerified = true;
                user.twoFactorEnabled = true;
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

  describe('GET /login', function() {

    it('should render the login page', function(done) {
      request(_app)
        .get('/login')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.text.should.containEql('Email or Username');
          res.text.should.containEql('<title>Login</title>');
          done();
        });
    });

  });

  describe('POST /login', function() {

    // simple wrapper for POSTing stuff again and again
    function postLogin(name, pass, cb) {
      request(_app)
        .post('/login')
        .send({login: name, password: pass})
        .end(cb);
    }

    it('should render an error message when login field is invalid', function(done) {
      postLogin('', 'secret', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.containEql('Please enter your email/username and password');
        done();
      });
    });

    it('should render an error message when password field is empty', function(done) {
      postLogin('john', '', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.containEql('Please enter your email/username and password');
        done();
      });
    });

    it('should render an error message when email is not verified', function(done) {
      postLogin('john', 'password', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.containEql('Invalid user or password');
        done();
      });
    });

    it('should render an error message when user is not in db', function(done) {
      postLogin('jack', 'password', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.containEql('Invalid user or password');
        done();
      });
    });

    it('should render an error message when password is false', function(done) {
      postLogin('john', 'something', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.containEql('Invalid user or password');
        done();
      });
    });

    it('should show a warning message after three failed login attempts', function(done) {
      // three login attempts
      postLogin('steve', 'wrong', function(err, res) {
        postLogin('steve', 'wrong', function(err, res) {
          postLogin('steve', 'wrong', function(err, res) {
            res.statusCode.should.equal(403);
            res.text.should.containEql('Invalid user or password. Your account will be locked soon.');
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
          res.text.should.containEql('Invalid user or password. Your account is now locked for ' + config.accountLockedTime);
          done();
        });
      });
    });

    it('should not allow login with a locked user account', function(done) {
      postLogin('steve', 'wrong', function(err, res) {
        res.statusCode.should.equal(403);
        res.text.should.containEql('The account is temporarily locked');
        done();
      });
    });

    it('should enable a locked account after certain amount of time', function(done) {
      // time is 5s in config
      setTimeout(function() {
        postLogin('steve', 'wrong', function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.containEql('Invalid user or password');
          done();
        });
      }, 2000);
    });

    it('should allow login in with a name', function(done) {
      // verify email address before making the request
      adapter.find('name', 'john', function(err, user) {
        // verify email manually
        user.emailVerified = true;
        // save updated user to db
        adapter.update(user, function(err, user) {
          // now make the request
          postLogin('john', 'password', function(err, res) {
            // test for proper redirection
            res.statusCode.should.equal(302);
            res.header.location.should.containEql('/');
            done();
          });
        });

      });
    });

    it('should allow login in with an email', function(done) {
      // we don't have to verify the email address as it is done by the test before
      postLogin('john@email.com', 'password', function(err, res) {
        // test for proper redirection
        res.statusCode.should.equal(302);
        res.header.location.should.containEql('/');
        done();
      });
    });

    it('should redirect to the main page when no redirect was necessary', function(done) {
      postLogin('john', 'password', function(err, res) {
        // test for proper redirection
        res.statusCode.should.equal(302);
        res.header.location.should.containEql('/');
        done();
      });
    });

    it('should redirect to the originally requested page', function(done) {
      request(_app)
        .post('/login?redirect=/test')
        .send({login: 'john', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(302);
          res.header.location.should.containEql('/test');
          done();
        });
    });

    it('should render two-factor auth view when two-factor auth is enabled', function(done) {
      var agent = superagent.agent();
      agent
        .post(config.url + '/login')
        .send({login: 'tf', password: 'twofactor'})
        .end(function(err, res) {
          res.text.should.containEql('Two-Factor Authentication');
          done();
        });
    });

    it('should not allow login when two-factor auth is enabled', function(done) {
      var agent = superagent.agent();
      // login
      agent
        .post(config.url + '/login')
        .send({login: 'tf', password: 'twofactor'})
        .end(function(err, res) {
          // try to access private page
          agent
            .get(config.url + '/test')
            .end(function(err, res) {
              res.statusCode.should.equal(200);
              res.redirects.should.eql(['http://localhost:3000/login?redirect=/test']);
              done();
            });
        });
    });

  });

  describe('POST /login/two-factor', function() {

    it('should redirect to /login route when token is invalid', function(done) {
      var agent = superagent.agent();
      // login
      agent
        .post(config.url + '/login')
        .send({login: 'tf', password: 'twofactor'})
        .end(function(err, res) {
          res.text.should.containEql('Two-Factor Authentication');
          agent.saveCookies(res);
          // enter invalid token
          agent
            .post(config.url + '/login/two-factor')
            .send({token: '123456'})
            .end(function(err, res) {
              res.redirects.should.eql(['http://localhost:3000/login?redirect=/']);
              done();
            });
        });
    });

    it('should log in a user when token is valid', function(done) {
      var agent = superagent.agent();
      // generate random key for test user and save to db
      var key = 'acbd1234';
      adapter.find('name', 'tf', function(err, user) {
        user.twoFactorKey = key;
        adapter.update(user, function(err, user) {
          // login
          agent
            .post(config.url + '/login')
            .send({login: 'tf', password: 'twofactor'})
            .end(function(err, res) {
              res.text.should.containEql('Two-Factor Authentication');
              agent.saveCookies(res);
              var token = totp.gen(key, {});
              // use two-factor authentication
              agent
                .post(config.url + '/login/two-factor')
                .send({token: token})
                .end(function(err, res) {
                  res.redirects.should.eql(['http://localhost:3000/']);
                  // now access private page
                  agent
                    .get(config.url + '/test')
                    .end(function(err, res) {
                      res.statusCode.should.equal(200);
                      res.text.should.containEql('well done');
                      done();
                    });
                });
            });
        });
      });
    });

  });

  describe('POST /logout', function() {

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
          res.text.should.containEql('well done');
          done();
        });
    });

    it('should render a success message and destroy the session', function(done) {
      agent
        .post(config.url + '/logout')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.text.should.containEql('You\'ve successfully logged out.');
          done();
        });
    });

    it('should then disallow access to restricted pages', function(done) {
      agent
        .get(config.url + '/test')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.redirects.should.eql(['http://localhost:3000/login?redirect=/test']);
          done();
        });
    });

  });

  after(function(done) {
    adapter.remove('john', function() {
      adapter.remove('steve', function() {
        adapter.remove('tf', done);
      });
    });
  });

});
