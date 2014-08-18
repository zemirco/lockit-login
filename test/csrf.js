
var request = require('supertest');
var should = require('should');
var utls = require('lockit-utils');
var cookie = require('cookie');

var config = require('./app/config.js');
var app = require('./app/app.js');

var db = utls.getDatabase(config);
var adapter = require(db.adapter)(config);

var _config = JSON.parse(JSON.stringify(config));
_config.csrf = true;
_config.port = 6000;
var _app = app(_config);

describe('# csrf', function() {

  before(function(done) {
    // create test user
    adapter.save('csrf', 'csrf@email.com', 'password', function(err, user) {
      // verify email for csrf
      adapter.find('name', 'csrf', function(err, user) {
        user.emailVerified = true;
        user.twoFactorEnabled = true;
        // save updated user to db
        adapter.update(user, function(err, user) {
          done();
        });
      });
    });
  });

  it('should include csrf token in "get-login" view', function(done) {
    request(_app)
      .get('/login')
      .end(function(err, res) {
        var cookies = cookie.parse(res.headers['set-cookie'][0]);
        var token = cookies.csrf;
        res.text.should.containEql('name="_csrf" value="' + token + '"');
        res.statusCode.should.equal(200);
        done();
      });
  });

  it('should include csrf token in "two-factor" view', function(done) {
    var agent = request.agent('http://localhost:6000');
    agent
      .get('/login')
      .end(function(err, res) {
        var cookies = cookie.parse(res.headers['set-cookie'][0]);
        var token = cookies.csrf;
        // give agent some time to put cookies from suitcase to store
        process.nextTick(function() {
          agent
            .post('/login')
            .set('x-csrf-token', token)
            .send({login: 'csrf', password: 'password'})
            .end(function(err, res) {
              res.statusCode.should.equal(200);
              done();
            });
        });
      });
  });

  after(function(done) {
    adapter.remove('csrf', done);
  });

});
