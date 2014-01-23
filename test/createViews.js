
var config = require('./config.js');

// create couchdb templates
var db = require('nano')(config.db);

// couchdb views we need to make the app work
var users = {
  _id: '_design/users',
  views: {
    username: {
      map: function(doc) {
        emit(doc.username, doc);
      }
    },
    email: {
      map: function(doc) {
        emit(doc.email, doc);
      }
    },
    signupToken: {
      map: function(doc) {
        emit(doc.signupToken, doc);
      }
    },
    pwdResetToken: {
      map: function(doc) {
        emit(doc.pwdResetToken, doc);
      }
    }
  }
};

// save views to db
db.insert(users, function(err, body) {
  if (err) console.log(err);
  console.log('done');
});