
var should = require('should');
var totp = require('notp').totp;
var superagent = require('superagent');

var config = require('./app/config.js');
config.port = 6500;
var app = require('./app/app.js');
var _app = app(config);

var config_two = JSON.parse(JSON.stringify(config));
config_two.port = 6501;
config_two.login.handleResponse = false;
var _app_two = app(config_two);

describe('# event listeners', function() {

  before(function(done) {
    // create a user with verified email
    _app._adapter.save('event', 'event@email.com', 'password', function() {
      // verify email for boat
      _app._adapter.find('name', 'event', function(err, user) {
        user.emailVerified = true;
        // save updated user to db
        _app._adapter.update(user, function() {
          // create user for two factor auth
          _app._adapter.save('auth', 'auth@email.com', 'password', function() {
            // verify email for auth
            _app._adapter.find('name', 'auth', function(err, user) {
              user.emailVerified = true;
              user.twoFactorEnabled = true;
              user.twoFactorKey = 'qwertz';
              // save updated user to db
              _app._adapter.update(user, done);
            });
          });
        });
      });
    });
  });

  var agent = superagent.agent();

  describe('POST /login', function() {

    it('should emit a "login" event on success', function(done) {
      _app._login.on('login', function(user, res, target) {
        user.name.should.equal('event');
        user.email.should.equal('event@email.com');
        target.should.equal('/');
        done();
      });
      agent
        .post('http://localhost:6500/login')
        .send({login: 'event', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(200);
        });
    });

    it('should not emit a "login" event when two-factor auth is enabled', function(done) {
      _app._login.removeAllListeners();
      var called = false;
      _app._login.on('login', function(user, res, target) {
        called = true;
      });
      agent
        .post('http://localhost:6500/login')
        .send({login: 'auth', password: 'password'})
        .end(function(err, res) {
          // give login event some time
          setTimeout(function() {
            called.should.be.false;
            done();
          }, 1000);
        });
    });

  });

  describe('POST /login/two-factor', function() {

    it('should emit a "login" event on success', function(done) {
      _app._login.removeAllListeners();
      _app._login.on('login', function(user, res, target) {
        user.name.should.equal('auth');
        user.email.should.equal('auth@email.com');
        target.should.equal('/');
        done();
      });
      agent
        .post('http://localhost:6500/login')
        .send({login: 'auth', password: 'password'})
        .end(function(err, res) {
          process.nextTick(function() {
            // enter valid token
            var token = totp.gen('qwertz', {});
            agent
              .post('http://localhost:6500/login/two-factor')
              .send({token: token})
              .end(function(err, res) {
                res.redirects.should.eql(['http://localhost:6500/']);
              });
          });
        });
    });

  });

  describe('POST /logout', function() {

    it('should emit a "logout" event on success', function(done) {
      _app._login.removeAllListeners();
      _app._login.on('logout', function(user, res) {
        user.name.should.equal('auth');
        user.email.should.equal('auth@email.com');
        done();
      });
      agent
        .post('http://localhost:6500/logout')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
        });
    });

  });

  describe('POST /login (handleResponse = false)', function() {

    it('should allow manual response handling', function(done) {
      _app_two._login.on('login', function(user, res, target) {
        res.send('awesome');
      });
      agent
        .post('http://localhost:6501/login')
        .send({login: 'event', password: 'password'})
        .end(function(err, res) {
          res.text.should.containEql('awesome');
          done();
        });
    });

  });

  describe('POST /logout (handleResponse = false)', function() {

    it('should allow manual response handling', function(done) {
      _app_two._login.removeAllListeners();
      _app_two._login.on('logout', function(user, res) {
        res.send('get out of here!');
      });
      agent
        .post('http://localhost:6501/logout')
        .end(function(err, res) {
          res.text.should.containEql('get out of here!');
          done();
        });
    });

  });

  after(function(done) {
    _app._adapter.remove('event', function() {
      _app._adapter.remove('auth', done);
    });
  });

});
