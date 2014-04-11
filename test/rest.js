
var request = require('supertest');
var should = require('should');
var superagent = require('superagent');
var utls = require('lockit-utils');

var config = require('./app/config.js');
var app = require('./app/app.js');

var db = utls.getDatabase(config);
var adapter = require(db.adapter)(config);

// create third app for testing REST
var _config = JSON.parse(JSON.stringify(config));
_config.rest = true;
_config.port = 5000;
var _app = app(_config);

describe('# with REST enabled', function() {

  before(function(done) {
    // create a user whose email is not verified
    adapter.save('bopp', 'bopp@email.com', 'password', function() {
      // create another user with verified email that does not interfere with login attempts
      adapter.save('boat', 'boat@email.com', 'password', function(err, user) {
        // verify email for boat
        adapter.find('name', 'boat', function(err, user) {
          user.emailVerified = true;
          // save updated user to db
          adapter.update(user, function(err, user) {
            // create another user with email verified
            adapter.save('beep', 'beep@email.com', 'password', function(err, user) {
              // verify email for beep
              adapter.find('name', 'beep', function(err, user) {
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

  describe('GET /login', function() {

    it('should not catch the route', function(done) {
      request(_app)
        .get('/rest/login')
        .end(function(err, res) {
          res.text.should.include('Cannot GET /rest/login');
          done();
        });
    });

  });

  describe('POST /login', function() {

    it('should send a JSON error message when login field is invalid', function(done) {
      request(_app)
        .post('/rest/login')
        .send({login: '', password: 'secret'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Please enter your email/username and password"}');
          done();
        });
    });

    it('should send a JSON error message when password field is empty', function(done) {
      request(_app)
        .post('/rest/login')
        .send({login: 'user', password: ''})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Please enter your email/username and password"}');
          done();
        });
    });

    it('should send a JSON error message when email is not verified', function(done) {
      request(_app)
        .post('/rest/login')
        .send({login: 'bopp', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Invalid user or password"}');
          done();
        });
    });

    it('should render a JSON error message when user is not in db', function(done) {
      request(_app)
        .post('/rest/login')
        .send({login: 'afkl', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Invalid user or password"}');
          done();
        });
    });

    it('should render a JSON error message when password is false', function(done) {
      request(_app)
        .post('/rest/login')
        .send({login: 'boat', password: 'something'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"Invalid user or password"}');
          done();
        });
    });

    it('should show a JSON error after three failed login attempts', function(done) {
      // don't use "steve" again as account will get locked
      request(_app)
        .post('/rest/login')
        .send({login: 'beep', password: 'wrong'})
        .end(function(err, res) {
          request(_app)
            .post('/rest/login')
            .send({login: 'beep', password: 'wrong'})
            .end(function(err, res) {
              request(_app)
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
      request(_app)
        .post('/rest/login')
        .send({login: 'beep', password: 'wrong'})
        .end(function(err, res) {
          request(_app)
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
      request(_app)
        .post('/rest/login')
        .send({login: 'beep', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.equal('{"error":"The account is temporarily locked"}');
          done();
        });
    });

    it('should enable a locked account after certain amount of time', function(done) {
      setTimeout(function() {
        request(_app)
          .post('/rest/login')
          .send({login: 'beep', password: 'password'})
          .end(function(err, res) {
            res.statusCode.should.equal(204);
            done();
          });
      }, 5000);
    });

    it('should allow login in with a name', function(done) {
      request(_app)
        .post('/rest/login')
        .send({login: 'beep', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(204);
          done();
        });
    });

    it('should allow login in with an email', function(done) {
      request(_app)
        .post('/rest/login')
        .send({login: 'beep@email.com', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(204);
          done();
        });
    });

  });

  describe('GET /logout', function() {

    var agent = superagent.agent();

    it('should only send the status code', function(done) {
      // login first
      agent
        .post('http://localhost:4000/login')
        .send({login:'beep', password:'password'})
        .end(function(err, res) {
          // then logout
          agent
            .get('http://localhost:5000/rest/logout')
            .end(function(err, res) {
              res.statusCode.should.equal(204);
              done();
            });
        });
    });

  });

  // remove user from db
  after(function(done) {
    adapter.remove('beep', function() {
      adapter.remove('boat', function() {
        adapter.remove('bopp', done);
      });
    });
  });

});
