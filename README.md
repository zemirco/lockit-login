# Lockit login

[![Build Status](https://travis-ci.org/zeMirco/lockit-login.svg?branch=master)](https://travis-ci.org/zeMirco/lockit-login) [![NPM version](https://badge.fury.io/js/lockit-login.svg)](http://badge.fury.io/js/lockit-login)

Log in users to your Express app. The module is part of [Lockit](https://github.com/zeMirco/lockit).

## Installation

`npm install lockit-login`

```js
var config = require('./config.js');
var login = require('lockit-login');

var app = express();

// express settings
// ...

// sessions are required - either cookie or some sort of db
app.use(express.cookieParser('your secret here'));
app.use(express.cookieSession());
app.use(app.router);

// use middleware after router so it doesn't interfere with your own routes
login(app, config);

// serve static files as last middleware
app.use(express.static(path.join(__dirname, 'public')));
```

## Configuration

More about configuration at [Lockit](https://github.com/zeMirco/lockit).

## Features

 - track failed log in attempts
 - lock account after too many failed login attempts
 - track time and ip of log ins
 - redirect unauthorized users to /login and save requested url to session
 - input validation
 - allow login with username and/or email

## Routes included

 - GET /login
 - POST /login
 - GET /logout

## REST API

If you've set `exports.rest = true` in your `config.js` the module behaves as follows.

 - all routes have `/rest` prepended
 - `GET /rest/login` is `next()`ed and you can catch `/login` on the client
 - `POST /rest/login` stays the same but sends JSON
 - `GET /rest/logout` sends JSON and you can catch `/logout` on the client

## Test

`grunt`

## License

MIT
