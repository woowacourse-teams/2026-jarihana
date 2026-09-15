/**
 * CloudFront viewer-request function for group social previews.
 *
 * The existing /api/* behavior must point to the backend origin. Requests with
 * ?preview=1 intentionally bypass this rewrite so the browser can load the
 * normal SPA shell after the metadata response's redirect.
 */
function handler(event) {
  var request = event.request;
  var match = request.uri.match(/^\/groups\/([1-9][0-9]*)\/?$/);

  if (
    request.method === "GET" &&
    match &&
    !(request.querystring && request.querystring.preview)
  ) {
    request.uri = "/api/share/groups/" + match[1];
  }

  return request;
}
