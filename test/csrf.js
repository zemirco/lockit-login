
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

  it('should include the csrf token in the view', function(done) {
    request(_app)
      .get('/login')
      .end(function(err, res) {
        var cookies = cookie.parse(res.headers['set-cookie'][0]);
        var token = cookies.csrf;
        res.text.should.include('name="_csrf" value="' + token + '"');
        res.statusCode.should.equal(200);
        done();
      });
  });

});
