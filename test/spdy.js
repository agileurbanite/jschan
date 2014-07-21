
'use strict';

var jschan          = require('../');
var abstractSession = require('./abstract_session');
var fs = require('fs');

describe('spdy session', function() {

  function inBuilder(cb) {
    var session = jschan.spdyServerSession({
      key: fs.readFileSync(__dirname + '/certificates/key.pem'),
      cert: fs.readFileSync(__dirname + '/certificates/cert.pem'),
      ca: fs.readFileSync(__dirname + '/certificates/csr.pem')
    }, cb);

    return session;
  }

  function outBuilder(session) {
    return jschan.spdyClientSession({
      host: session.host,
      port: session.port,
      rejectUnauthorized: false
    });
  }

  abstractSession(inBuilder, outBuilder);
});
