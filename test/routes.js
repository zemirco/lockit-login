
var request = require('supertest');
var superagent = require('superagent');
var should = require('should');
var utls = require('lockit-utils');

var config = require('./app/config.js');
var app = require('./app/app.js');

var db = utls.getDatabase(config);
var adapter = require(db.adapter)(config);

var _config = JSON.parse(JSON.stringify(config));
_config.port = 9000;
_config.login.route ='/custom-login';
_config.login.logoutRoute = '/custom-logout';
_config.login.twoFactorRoute = '/three-factor';

var _app = app(_config);

describe('# custom routes', function() {

  before(function(done) {
    adapter.save('routes', 'routes@email.com', 'password', function(err, user) {
      adapter.find('name', 'routes', function(err, user) {
        user.emailVerified = true;
        adapter.update(user, done);
      });
    });
  });

  describe('GET /login', function() {

    it('should work with custom routes', function(done) {
      request(_app)
        .get('/custom-login')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.text.should.containEql('Email or Username');
          done();
        });
    });

  });

  describe('POST /login', function() {

    it('should render an error message when login field is invalid', function(done) {
      request(_app)
        .post('/custom-login')
        .send({login: 'some', password: 'pass'})
        .end(function(err, res) {
          res.statusCode.should.equal(403);
          res.text.should.containEql('Invalid user or password');
          done();
        });
    });

  });

  describe('POST /login/two-factor', function() {

    it('should work with a custom login route', function(done) {
      request(_app)
        .post('/custom-login/three-factor')
        .send({login: 'some', password: 'pass'})
        .end(function(err, res) {
          res.statusCode.should.equal(302);
          res.header.location.should.containEql('/custom-login');
          done();
        });
    });

  });

  describe('POST /logout', function() {

    var agent = superagent.agent();

    it('should start with login', function(done) {
      agent
        .post('http://localhost:9000/custom-login')
        .send({login:'routes', password:'password'})
        .end(function() {
          agent
            .post('http://localhost:9000/custom-logout')
            .end(function(err, res) {
              res.statusCode.should.equal(200);
              res.text.should.containEql('You\'ve successfully logged out.');
              done();
            });
        });
    });

  });

  after(function(done) {
    adapter.remove('routes', done);
  });

});
