/**
 * CloudFront viewer-request function for group/debate social previews and SPA routes.
 *
 * Attach this function to the default (S3) behavior at Viewer request using
 * CloudFront Functions runtime 2.0. A URI rewrite alone does not change the
 * selected origin, so the metadata request explicitly selects the backend
 * origin for known share crawlers. Browsers and unrecognized clients get the
 * SPA shell at the original address. The rewritten URIs separate cached
 * metadata from the SPA shell. API paths and static files pass through.
 */
import cf from "cloudfront";

// CloudFront Distribution E1YDHL1SDC4C1C > Origins > Origin name
var BACKEND_ORIGIN_ID = "jarihana-backend";
var SHARE_CRAWLER = /(?:^|[\s;])(?:kakaotalk-scrap|slackbot-linkexpanding|facebookexternalhit|facebot|twitterbot)(?=$|[/\s;])/i;

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var match = uri.match(/^\/(groups|sparring)\/([1-9][0-9]*)\/?$/);

  if (request.method === "GET" && match) {
    // The browser keeps the original URL. Avoid forwarding arbitrary queries
    // to either origin or creating cache variants for them.
    request.querystring = {};
    var userAgent = request.headers && request.headers["user-agent"];
    if (userAgent && SHARE_CRAWLER.test(userAgent.value)) {
      var resource = match[1] === "groups" ? "groups" : "sparrings";
      request.uri = "/api/share/" + resource + "/" + match[2];
      cf.selectRequestOriginById(BACKEND_ORIGIN_ID);
      return request;
    }
  }

  if (uri === "/api" || uri.indexOf("/api/") === 0) {
    return request;
  }

  var lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
  if (uri === "/" || uri.endsWith("/") || lastSegment.indexOf(".") === -1) {
    request.uri = "/index.html";
  }

  return request;
}
