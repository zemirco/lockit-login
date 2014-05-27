
##### 1.1.2 / 2014-05-27

- set `autocomplete="off"` in forms
- use Bootstrap responsive classes
- stop creating an extra test db for Travis
- use Bootstrap CSS in test app

##### 1.1.1 / 2014-05-23

- update lockit-utils

##### 1.1.0 / 2014-05-22

- add two-factor authentication
- add custom two-factor route via `config.login.twoFactorRoute`
- use `req.query.redirect` instead of adding redirect target to session
- make `action` in `get-login.jade` configurable
- use `util.destroy` helper method for logout

##### 1.0.1 / 2014-05-19

- set `req.session.loggedIn` to `true` on login
- code refactoring
- update dependencies

##### 1.0.0 / 2014-04-19

- requires Express 4.x
- makes use of `express.Router()`. No need to pass `app` around as argument.

  **old**

  ```js
  var Login = require('lockit-login');

  var login = new Login(app, config, adapter);
  ```

  **new**

  ```js
  var Login = require('lockit-login');

  var login = new Login(config, adapter);
  app.use(login.router);
  ```

  Listening on events **stays the same**.

  ```js
  login.on('login', function(user, res, target) {
    res.send('Welcome ' + user.name);
  })
  ```

- proper Error handling. All Errors are piped to next middleware.

  **old**

  ```js
  if (err) console.log(err);
  ```

  **new**

  ```js
  if (err) return next(err);
  ```

  Make sure you have some sort of error handling middleware at the end of your
  routes (is included by default in Express 4.x apps if you use the `express-generator`).

##### 0.7.0 / 2014-04-11

- `username` becomes `name`
