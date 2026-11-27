// CloudFront Function (viewer-request, runtime cloudfront-js-2.0) for the S3 + Origin Access Control origin of the Kiorly site.
// S3 has no directory index, so /ar/clinics/ and /ar/clinics become /ar/clinics/index.html. Files with an extension pass through untouched.
// Not applied by this repository: the infrastructure owner attaches it to the distribution (see apps/kiorly-site/README.md).
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) request.uri = uri + 'index.html';
  else if (uri.indexOf('.', uri.lastIndexOf('/')) === -1) request.uri = uri + '/index.html';
  return request;
}
