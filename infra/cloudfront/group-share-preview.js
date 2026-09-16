/**
 * CloudFront viewer-request function for group social previews.
 *
 * Attach this function to the default (S3) behavior at Viewer request using
 * CloudFront Functions runtime 2.0. A URI rewrite alone does not change the
 * selected origin, so the metadata request explicitly selects the backend
 * origin. Requests with ?preview=1 intentionally remain on the default
 * behavior so the browser can load the normal SPA shell after the metadata
 * response's redirect.
 */
import cf from "cloudfront";

// CloudFront Distribution E1YDHL1SDC4C1C > Origins > Origin name
var BACKEND_ORIGIN_ID = "jarihana-backend";

function handler(event) {
  var request = event.request;
  var match = request.uri.match(/^\/groups\/([1-9][0-9]*)\/?$/);

  if (
    request.method === "GET" &&
    match &&
    !(request.querystring && request.querystring.preview)
  ) {
    request.uri = "/api/share/groups/" + match[1];
    cf.selectRequestOriginById(BACKEND_ORIGIN_ID);
  }

  return request;
}
