package com.project.jarihana.share.query.controller;

final class GroupSharePreviewHtmlTemplate {

    private static final String CONTENT = """
            <!doctype html>
            <html lang="ko">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>%s</title>
                <meta name="description" content="%s">
                <link rel="canonical" href="%s">
                <meta property="og:type" content="website">
                <meta property="og:site_name" content="자리하나">
                <meta property="og:locale" content="ko_KR">
                <meta property="og:title" content="%s">
                <meta property="og:description" content="%s">
                <meta property="og:url" content="%s">
                <meta property="og:image" content="%s">
                <meta name="twitter:card" content="summary_large_image">
                <meta name="twitter:title" content="%s">
                <meta name="twitter:description" content="%s">
                <meta name="twitter:image" content="%s">
                <script>
                  const promotionValues = new URLSearchParams(window.location.search)
                    .getAll("promotion_id");
                  const promotionId =
                    promotionValues.length === 1 &&
                    /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(promotionValues[0])
                      ? promotionValues[0]
                      : null;
                  const target = new URL(
                    document.querySelector('link[rel="canonical"]').href
                  );
                  target.searchParams.set("preview", "1");
                  if (promotionId) target.searchParams.set("promotion_id", promotionId);
                  window.location.replace(target.href);
                </script>
              </head>
              <body>
                <noscript><p><a href="%s">모임 페이지로 이동</a></p></noscript>
              </body>
            </html>
            """;

    private GroupSharePreviewHtmlTemplate() {
    }

    static String render(
            String title,
            String description,
            String canonicalUrl,
            String imageUrl,
            String redirectUrl
    ) {
        return CONTENT.formatted(
                title,
                description,
                canonicalUrl,
                title,
                description,
                canonicalUrl,
                imageUrl,
                title,
                description,
                imageUrl,
                redirectUrl
        );
    }
}
