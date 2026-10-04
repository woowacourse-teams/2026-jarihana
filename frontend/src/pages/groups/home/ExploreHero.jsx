const introduction = "크루와 함께할 자리를 찾아보세요";

export function ExploreHero({ children, headline = "", period = "day", isAuthenticated = false }) {
  const accent = /세 번|같이|커피|점심|갓생|칼퇴|공범|추억|자리|퇴실|집중력/.exec(headline);
  const highlightedHeadline = (
    <span className="reference-hero__message" id="home-headline">
      {accent ? (
        <>
          {headline.slice(0, accent.index)}
          <span className="reference-hero__headline-accent">{accent[0]}</span>
          {headline.slice(accent.index + accent[0].length)}
        </>
      ) : (
        headline
      )}
    </span>
  );

  return (
    <section
      className="groups-hero reference-hero"
      data-time-of-day={period}
      aria-labelledby="groups-title"
    >
      <div className="groups-hero__copy">
        <h1
          className="reference-hero__title"
          id="groups-title"
          aria-label={isAuthenticated ? headline : introduction}
        >
          {isAuthenticated ? (
            highlightedHeadline
          ) : (
            <>
              <span>크루와</span>
              <span>
                함께할 <span className="reference-hero__headline-accent">자리</span>를
              </span>
              <span>찾아보세요</span>
            </>
          )}
        </h1>
        <p className="reference-hero__subtitle">
          {isAuthenticated ? (
            <>
              크루와 함께할 <span className="reference-hero__headline-accent">자리</span>를 찾아보세요
            </>
          ) : (
            highlightedHeadline
          )}
        </p>
        {children}
      </div>
    </section>
  );
}
