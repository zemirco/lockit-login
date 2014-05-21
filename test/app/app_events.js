
var path = require('path');
var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var superagent = require('superagent');
var cookieParser = require('cookie-parser');
var cookieSession = require('cookie-session');
var should = require('should');
var utils = require('lockit-utils');
var routes = require('./routes');
var user = require('./routes/user');

var config = require('./config.js');
var Login = require('../../');

var app = express();
app.locals.basedir = __dirname + '/app/views';
app.set('port', 6500);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(cookieSession({
  secret: 'this is my super secret string'
}));
app.use(express.static(path.join(__dirname, 'public')));
var db = utils.getDatabase(config);
var adapter = require(db.adapter)(config);
var login = new Login(config, adapter);
app.get('/', routes.index);
app.get('/users', user.list);
app.use(login.router);
http.createServer(app).listen(app.get('port'));

// create second app that manually handles responses
var config_two = JSON.parse(JSON.stringify(config));
config_two.login.handleResponse = false;
var app_two = express();
app_two.locals.basedir = __dirname + '/app/views';
app_two.set('port', 6501);
app_two.set('views', __dirname + '/views');
app_two.set('view engine', 'jade');
app_two.use(bodyParser.json());
app_two.use(bodyParser.urlencoded());
app_two.use(cookieParser());
app_two.use(cookieSession({
  secret: 'this is my super secret string'
}));
app_two.use(express.static(path.join(__dirname, 'public')));
var login_two = new Login(config_two, adapter);
app_two.get('/', routes.index);
app_two.get('/users', user.list);
app_two.use(login_two.router);
http.createServer(app_two).listen(app_two.get('port'));

describe('# event listeners', function() {

  before(function(done) {
    // create a user with verified email
    adapter.save('event', 'event@email.com', 'password', function() {
      // verify email for boat
      adapter.find('name', 'event', function(err, user) {
        user.emailVerified = true;
        // save updated user to db
        adapter.update(user, done);
      });
    });
  });

  var agent = superagent.agent();
  var agent_two = superagent.agent();

  describe('POST /login', function() {

    it('should emit a "login" event on success', function(done) {
      login.on('login', function(user, res, target) {
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

    it.skip('should not emit a "login" event when two-factor auth is enabled', function(done) {

    });

  });

  describe.skip('POST /login/two-factor', function() {

    it('should emit a "login" event when two-factor auth is enabled', function(done) {

    });

  });

  describe('GET /logout', function() {

    it('should emit a "logout" event on success', function(done) {
      login.on('logout', function(user, res) {
        user.name.should.equal('event');
        user.email.should.equal('event@email.com');
        done();
      });
      agent
        .get('http://localhost:6500/logout')
        .end(function(err, res) {
          res.statusCode.should.equal(200);
        });
    });

  });

  describe('POST /login (handleResponse = false)', function() {
    // user 'event' needs to log out first
    it('should allow manual response handling', function(done) {
      login_two.on('login', function(user, res, target) {
        res.send('awesome');
      });
      agent_two
        .post('http://localhost:6501/login')
        .send({login: 'event', password: 'password'})
        .end(function(err, res) {
          res.text.should.include('awesome');
          done();
        });
    });
  });

  describe('GET /logout (handleResponse = false)', function() {

    it('should allow manual response handling', function(done) {
      login_two.on('logout', function(user, res) {
        res.send('get out of here!');
      });
      agent_two
        .get('http://localhost:6501/logout')
        .end(function(err, res) {
          res.text.should.include('get out of here!');
          done();
        });
    });

  });

  after(function(done) {
    adapter.remove('event', done);
  });

});
