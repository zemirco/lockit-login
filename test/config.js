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

// lock account
exports.failedLoginsWarning = 3;
exports.failedLoginAttempts = 5;

// set to 5 seconds for testing
exports.accountLockedTime = '5 seconds';

// settings for test
exports.db = 'couchdb';
exports.dbUrl = 'http://127.0.0.1:5984/test';