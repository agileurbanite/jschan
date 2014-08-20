
'use strict';

var EventEmitter  = require('events').EventEmitter;
var channels      = require('./channels');
var inherits      = require('inherits');
var through       = require('through2');
var ReadChannel   = channels.ReadChannel;
var WriteChannel  = channels.WriteChannel;
var ByteStream    = channels.ByteStream;
var encoder       = require('../encoder');
var PassThrough   = require('readable-stream').PassThrough;

function StreamSession(inStream, outStream, opts, server) {
  if (!(this instanceof StreamSession)) {
    return new StreamSession(inStream, outStream, opts, server);
  }

  opts = opts || {};

  this._isServer = opts.server || false;

  this._inStream = inStream;
  this._outStream = outStream;
  this._delayedChannels = [];
  this._streams = {};
  this._nextId = this._isServer ? 0 : 1;
  this._toBeWritten = [];
  this._encoder = encoder(this, channels);

  var that = this;

  this._readPipe = inStream
    .pipe(this._encoder.decoder(opts))
    .pipe(through.obj(function(chunk, enc, done) {
      if (chunk.id === undefined) {
        that.emit('error', new Error('wrong message format, missing id'));
        return;
      }

      var count = EventEmitter.listenerCount(that, 'channel');
      var stream = that._streams[chunk.id];

      if (!stream && !chunk.parent) {
        stream = new ReadChannel(that, chunk.id);
        that._streams[stream.id] = stream;

        if (count > 0 ) {
          that.emit('channel', stream);
        } else {
          that._delayedChannels.push(stream);
        }
      }

      if (!stream) {
        // we need to queue data
        stream = new PassThrough({
          objectMode: true,
          highWaterMark: 16
        });
        stream.id = chunk.id;
        that._streams[stream.id] = stream;
      }

      if (stream.dispatch) {
        stream.dispatch(chunk.data, done);
      } else if (chunk.data) {
        stream.write(chunk.data, null, done);
      } else {
        stream.end();
        done();
      }
    }));

  this._writePipe = this._encoder.encoder(opts);
  this._writePipe.pipe(outStream);

  this.on('newListener', function(event, listener) {
    var chan;
    if (event === 'channel') {
      while ((chan = this._delayedChannels.pop())) {
        listener(chan);
      }
    }
  });

  this._encoder.on('channel', function(chan) {
    if (that._streams[chan.id]) {
      that._streams[chan.id].pipe(chan, { end: false });
    }
    that._streams[chan.id] = chan;
  });

  if (server) {
    this.on('channel', server);
  }
}

inherits(StreamSession, EventEmitter);

function createChannel(session, Type, parent) {
  var chan  = new Type(session, session._nextId);

  if (parent) {
    chan.parentId = parent.id;
  }

  session._nextId += 2;
  session._streams[chan.id] = chan;
  return chan;
}

StreamSession.prototype._createWriteChannel = function(parent) {
  return createChannel(this, WriteChannel, parent);
};
StreamSession.prototype._createReadChannel  = function(parent) {
  return createChannel(this, ReadChannel, parent);
};

StreamSession.prototype._createByteStream = function(parent) {
  return createChannel(this, ByteStream, parent);
};

StreamSession.prototype.createWriteChannel = function createWriteChannel() {
  return this._createWriteChannel();
};

StreamSession.prototype._dispatch = function dispatch(obj, done) {
  this._writePipe.write(obj, done);
  return this;
};

StreamSession.prototype.close = function close(cb) {
  // TODO respect cb and wait for these two to be closed
  this._inStream.end();
  this._outStream.end();

  if (cb) {
    cb(null);
  }
  return this;
};

module.exports = StreamSession;