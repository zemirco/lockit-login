# Lockit login

[![Build Status](https://travis-ci.org/zemirco/lockit-login.svg?branch=master)](https://travis-ci.org/zemirco/lockit-login)
[![NPM version](https://badge.fury.io/js/lockit-login.svg)](http://badge.fury.io/js/lockit-login)
[![Dependency Status](https://david-dm.org/zemirco/lockit-login.svg)](https://david-dm.org/zemirco/lockit-login)

Log in users to your Express app. The module is part of [Lockit](https://github.com/zemirco/lockit).

## Installation

`npm install lockit-login`

```js
var Login = require('lockit-login');
var utils = require('lockit-utils');
var config = require('./config.js');

var db = utils.getDatabase(config);
var adapter = require(db.adapter)(config);

var app = express();

// express settings
// ...
// sessions are required - either cookie or some sort of db
app.use(cookieParser());
app.use(cookieSession({
  secret: 'this is my super secret string'
}));

// create new Login instance
var login = new Login(config, adapter);

// use login.router with your app
app.use(login.router);

// listen to events [optional]
login.on('login', function(user, res, target) {
  res.send('Welcome ' + user.name);
})
```

## Configuration

More about configuration at [Lockit](https://github.com/zemirco/lockit).

## Features

- two-factor authentication
- track failed log in attempts
- lock account after too many failed login attempts
- track time and ip of log ins
- redirect unauthorized users to /login and save requested url to session
- input validation
- allow login with username and/or email

## Routes included

 - GET /login
 - POST /login
 - POST /login/two-factor
 - GET /logout

## REST API

If you've set `exports.rest` in your `config.js` the module behaves as follows.

 - all routes have `/rest` prepended
 - `GET /rest/login` is `next()`ed and you can catch `/login` on the client
 - `POST /rest/login` stays the same but sends JSON
 - `POST /rest/login/two-factor` stays the same but sends JSON
 - `GET /rest/logout` sends JSON and you can catch `/logout` on the client

## Test

`grunt`

## License

MIT
