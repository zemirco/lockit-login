
var request = require('supertest');
var superagent = require('superagent');
var should = require('should');
var utls = require('lockit-utils');

var config = require('./app/config.js');
var app = require('./app/app.js');

var db = utls.getDatabase(config);
var adapter = require(db.adapter)(config);

var _config = JSON.parse(JSON.stringify(config));

_config.port = 4000;
_config.login.views = {
  login: 'custom/login',
  loggedOut: 'custom/loggedOut',
  twoFactor: 'custom/auth'
};

var _app = app(_config);

describe('# custom views', function() {

  before(function(done) {
    // create test user
    adapter.save('alan', 'alan@email.com', 'password', function(err, user) {
      // verify email for steve
      adapter.find('name', 'alan', function(err, user) {
        user.emailVerified = true;
        // save updated user to db
        adapter.update(user, function(err, user) {
          // add user to test two-factor auth view
          adapter.save('buffy', 'buffy@email.com', 'password', function(err, user) {
            // verify email for buffy and activate two-factor auth
            adapter.find('name', 'buffy', function(err, user) {
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

  describe('GET /login', function() {

    it('should use the custom template', function(done) {
      request(_app)
        .get('/login')
        .end(function(err, res) {
          res.text.should.containEql('Join the community');
          done();
        });
    });

  });

  describe('POST /login', function() {

    it('should work with custom views', function(done) {
      request(_app)
        .post('/login')
        .send({login: '', password: 'scret'})
        .end(function(err, res) {
          res.text.should.containEql('Join the community');
          done();
        });
    });

    it('should render custom two-factor view', function(done) {
      request(_app)
        .post('/login')
        .send({login: 'buffy', password: 'password'})
        .end(function(err, res) {
          res.text.should.containEql('Nope, not yet!');
          done();
        });
    });

  });

  describe('POST /logout', function() {

    var agent = superagent.agent();

    it('should work with custom views', function(done) {
      // login first
      agent
        .post('http://localhost:4000/login')
        .send({login:'alan', password:'password'})
        .end(function(err, res) {
          // then logout
          agent
            .post('http://localhost:4000/logout')
            .end(function(err, res) {
              if (err) console.log(err);
              res.text.should.containEql('You did it!');
              done();
            });
        });
    });

  });

  after(function(done) {
    adapter.remove('alan', function() {
      adapter.remove('buffy', done);
    });
  });

});
