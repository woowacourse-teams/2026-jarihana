describe("formatKoreanDate", () => {
  it("Given repeated dates, When values are formatted, Then the Korean formatter is reused", () => {
    // Given
    const format = jest.fn(() => "2026. 8. 21.");
    const formatter = jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({ format }));
    let formatKoreanDate;
    jest.isolateModules(() => {
      ({ formatKoreanDate } = require("../../../src/pages/account/accountUtils.js"));
    });

    // When
    formatKoreanDate("2026-08-21T11:00:00");
    formatKoreanDate("2026-08-22T11:00:00");

    // Then
    expect(formatter).toHaveBeenCalledTimes(1);
    expect(format).toHaveBeenCalledTimes(2);
    formatter.mockRestore();
  });
});
