/**
 * CloudFront viewer-request function for group social previews.
 *
 * Attach this function to the default (S3) behavior at Viewer request using
 * CloudFront Functions runtime 2.0. A URI rewrite alone does not change the
 * selected origin, so the metadata request explicitly selects the backend
 * origin. Requests with ?preview=1 intentionally remain on the default
 * behavior so the browser can load the normal SPA shell after the metadata
 * response's redirect. Query strings are removed before either origin request;
 * metadata HTML reads the browser-visible URL and carries only one validated
 * promotion_id into that redirect, so origin responses remain safe to cache.
 */
import cf from "cloudfront";

// CloudFront Distribution E1YDHL1SDC4C1C > Origins > Origin name
var BACKEND_ORIGIN_ID = "jarihana-backend";

function handler(event) {
  var request = event.request;
  var match = request.uri.match(/^\/groups\/([1-9][0-9]*)\/?$/);
  var preview = request.querystring && request.querystring.preview;
  var isPreview = preview && !preview.multiValue && preview.value === "1";

  if (
    request.method === "GET" &&
    match
  ) {
    // The browser keeps the original URL, so the HTML and SPA can read the
    // promotion_id locally. Do not forward arbitrary query parameters to an
    // origin or create cache variants for them.
    request.querystring = {};
    if (!isPreview) {
      request.uri = "/api/share/groups/" + match[1];
      cf.selectRequestOriginById(BACKEND_ORIGIN_ID);
    }
  }

  return request;
}
