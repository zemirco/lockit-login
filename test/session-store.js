
var should = require('should');
var superagent = require('superagent');
var utls = require('lockit-utils');

var config = require('./app/config.js');
var app = require('./app/app.js');

var _config = JSON.parse(JSON.stringify(config));
_config.url = 'http://localhost:3500';
_config.port = 3500;
_config.useSessionStore = true;
var _app = app(_config);

var db = utls.getDatabase(_config);
var adapter = require(db.adapter)(_config);

describe('# session store', function() {

  before(function(done) {
    // add dummy user and verify email
    adapter.save('steve', 'steve@email.com', 'password', function(err, user) {
      // verify email for steve
      adapter.find('name', 'steve', function(err, user) {
        user.emailVerified = true;
        // save updated user to db
        adapter.update(user, function(err, user) {
          done();
        });
      });
    });
  });

  describe('POST /logout', function() {

    var agent = superagent.agent();

    it('should start with login', function(done) {
      agent
        .post(_config.url + '/login')
        .send({login:'steve', password:'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.redirects.should.eql(['http://localhost:3500/']);
          done();
        });
    });

    it('should then allow access to restricted pages', function(done) {
      agent
        .get(_config.url + '/test')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.text.should.containEql('well done');
          done();
        });
    });

    it('should render a success message and destroy the session', function(done) {
      agent
        .post(_config.url + '/logout')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.text.should.containEql('You\'ve successfully logged out.');
          done();
        });
    });

    it('should then disallow access to restricted pages', function(done) {
      agent
        .get(_config.url + '/test')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
          res.redirects.should.eql(['http://localhost:3500/login?redirect=/test']);
          done();
        });
    });

  });

  after(function(done) {
    adapter.remove('steve', done);
  });

});
