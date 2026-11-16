import cf from "cloudfront";

// CloudFront Distribution E1YDHL1SDC4C1C > Origins > Origin name
var BACKEND_ORIGIN_ID = "jarihana-backend";

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var match = uri.match(/^\/groups\/([1-9][0-9]*)\/?$/);
  var preview = request.querystring && request.querystring.preview;
  var isPreview = preview && !preview.multiValue && preview.value === "1";

  if (request.method === "GET" && match) {
    // The browser keeps the original URL, so the HTML and SPA can read the
    // promotion_id locally. Do not forward arbitrary query parameters to an
    // origin or create cache variants for them.
    request.querystring = {};
    if (!isPreview) {
      request.uri = "/api/share/groups/" + match[1];
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