function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === "/api" || uri.indexOf("/api/") === 0) {
    return request;
  }

  var lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
  if (uri === "/" || uri.endsWith("/") || lastSegment.indexOf(".") === -1) {
    request.uri = "/index.html";
  }

  return request;
}
