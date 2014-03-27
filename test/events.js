
var path = require('path');
var http = require('http');
var express = require('express');
var superagent = require('superagent');
var should = require('should');
var utls = require('lockit-utils');

var config = require('./app/config.js');
var Login = require('../');

var app = express();
app.locals.basedir = __dirname + '/app/views';
app.set('port', 6500);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.urlencoded());
app.use(express.json());
app.use(express.cookieParser('your secret here'));
app.use(express.cookieSession());
app.use(function(req, res, next) {
  req.session.redirectUrlAfterLogin = '/jep';
  next();
});
app.use(app.router);
app.get('/jep', function(req, res) {
  res.send(200);
});
app.use(express.static(path.join(__dirname, 'public')));
http.createServer(app).listen(app.get('port'));

var db = utls.getDatabase(config);
var adapter = require(db.adapter)(config);

var login = new Login(app, config, adapter);

// create second app that manually handles responses
var config_two = JSON.parse(JSON.stringify(config));
config_two.login.handleResponse = false;
var app_two = express();
app_two.locals.basedir = __dirname + '/app/views';
app_two.set('port', 6501);
app_two.set('views', __dirname + '/views');
app_two.set('view engine', 'jade');
app_two.use(express.urlencoded());
app_two.use(express.json());
app_two.use(express.cookieParser('your secret here'));
app_two.use(express.cookieSession());
app_two.use(app_two.router);
app_two.use(express.static(path.join(__dirname, 'public')));
http.createServer(app_two).listen(app_two.get('port'));

var login_two = new Login(app_two, config_two, adapter);

describe('# event listeners', function() {

  before(function(done) {
    // create a user with verified email
    adapter.save('event', 'event@email.com', 'password', function() {
      // verify email for boat
      adapter.find('username', 'event', function(err, user) {
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
        user.username.should.equal('event');
        user.email.should.equal('event@email.com');
        target.should.equal('/jep');
        done();
      });
      agent
        .post('http://localhost:6500/login')
        .send({login: 'event', password: 'password'})
        .end(function(err, res) {
          res.statusCode.should.equal(200);
        });
    });

  });

  describe('GET /logout', function() {

    it('should emit a "logout" event on success', function(done) {
      login.on('logout', function(user, res) {
        user.username.should.equal('event');
        user.email.should.equal('event@email.com');
        done();
      });
      agent
        .get('http://localhost:6500/logout')
        .end(function(err, res) {});
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
    adapter.remove('username', 'event', done);
  });

});
