exports.appname = 'Test App';
exports.url = 'http://localhost:3000';

// email settings
exports.emailType = 'Stub';
exports.emailSettings = {
  service: 'none',
  auth: {
    user: 'none',
    pass: 'none'
  }
};

exports.login = {
  route: '/login',
  logoutRoute: '/logout',
  views: {
    login: '',          // input fields 'login' and 'password' | POST /'login.route' | local variable 'error'
    loggedOut: ''   // message that user logged out
  },
  handleResponse: true  // let Lockit handle the response which is sent to the user
};

// signup settings
exports.signup = {
  tokenExpiration: '1 day'
};

// lock account
exports.failedLoginsWarning = 3;
exports.failedLoginAttempts = 5;

// set to 5 seconds for testing
exports.accountLockedTime = '5 seconds';

// settings for test
exports.db = 'http://127.0.0.1:5984/test';