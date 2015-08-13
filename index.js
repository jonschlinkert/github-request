var https = require('https');
var url = require('url');

var defaults = function (data) {
  return {
    host: 'api.github.com',
    method: 'GET',
    headers: {
      'user-agent': 'github-request-v' + require('./package').version,
      'content-length': typeof data === 'string' ? data.length : 0
    }
  };
};

function request(options, data, cb) {
  if (typeof data === 'function') {
    cb = data;
    data = null;
  } else {
    data = JSON.stringify(data);
  }

  if (typeof cb !== 'function') {
    throw new TypeError('expected a callback function');
  }

  options = options || {};
  var config = defaults(data);
  var opts = extend(config, options);
  opts.headers = extend(config.headers, options.headers);

  var req = https.request(opts, function (res) {
    var meta = getMeta(res);
    var body = '';

    res.setEncoding('utf8');
    res.on('data', function (chunk) {
      body += chunk;
    });

    res.on('end', function () {
      if (res.statusCode === 204) {
        return cb(null, body, meta);
      }
      if (res.statusCode >= 400) {
        return handleError(res, cb);
      }
      cb(null, JSON.parse(body), meta);
    });
  });

  req.on('error', cb);
  if (data) req.write(data);
  req.end();
}

request.all = function requestAll(opts, cb) {
  // Force the request to use a page size of 100 for optimal performance
  var parsed = url.parse(opts.path, true);
  delete parsed.search;
  parsed.query.per_page = 100;
  opts.path = url.format(parsed);

  request(opts, function(err, data, meta) {
    if (err) return cb(err);

    if (!meta.links || !meta.links.next) {
      return cb(null, data, meta);
    }

    opts.path = url.parse(meta.links.next).path;
    request.all(opts, function(err, data2, meta2) {
      if (err) return cb(err);
      cb(null, data.concat(data2), meta2);
    });
  });
};

module.exports = request;

function handleError(res, cb) {
  var type = res.headers['content-type'];
  var msg;
  if (~type.indexOf('json')) {
    msg = JSON.parse(body).message;
  } else {
    msg = body;
  }
  if (!msg && res.statusCode === 403) {
    msg = 'Forbidden';
  }
  cb(new Error(msg));
}

function getMeta(res) {
  var keys = Object.keys(res.headers);
  var meta = {};
  keys.forEach(function (header) {
    if (/^(x-(ratelimit|github))/.test(header)) {
      meta[xHeader(header)] = res.headers[header];
    } else if (header === 'link') {
      var links = res.headers.link.split(/,\s*/);
      meta.links = {};
      links.forEach(function (link) {
        var parts = /<([^>]+)>;\s*rel="([^"]+)"/.exec(link);
        meta.links[parts[2]] = parts[1];
      });
    }
  });
  return meta;
}

function extend(a, b) {
  for (var prop in b) a[prop] = b[prop];
  return a;
}

function xHeader(str) {
  str = str.replace(/^x-/, '');
  return str.replace(/-([a-z])/g, function (all, letter) {
    return letter.toUpperCase();
  });
}
