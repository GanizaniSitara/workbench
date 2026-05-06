import { describe, expect, it } from "vitest";

import {
  newsApiPath,
  newsMonikerFromSymbols,
  newsProviderFromMoniker,
  newsTopicFromMoniker,
  symbolsFromNewsMoniker,
} from "../../src/lib/news-moniker";

describe("news monikers", () => {
  it("parses symbol-linked company news", () => {
    expect(symbolsFromNewsMoniker("news.company/AAPL,MSFT", ["SPY"])).toEqual([
      "AAPL",
      "MSFT",
    ]);
    expect(newsProviderFromMoniker("news.company/AAPL")).toBe("openbb");
  });

  it("keeps an explicitly empty company-news moniker empty", () => {
    expect(symbolsFromNewsMoniker("news.company", ["SPY", "QQQ"])).toEqual([]);
    expect(symbolsFromNewsMoniker("news.company/", ["SPY", "QQQ"])).toEqual([]);
    expect(newsMonikerFromSymbols([])).toBe("news.company");
  });

  it("falls back only when the moniker is not company-news symbol state", () => {
    expect(symbolsFromNewsMoniker(undefined, ["SPY"])).toEqual(["SPY"]);
    expect(symbolsFromNewsMoniker("news/gdelt", ["SPY"])).toEqual(["SPY"]);
  });

  it("treats GDELT news as provider-linked, not symbol-linked", () => {
    expect(symbolsFromNewsMoniker("news/gdelt", ["SPY"])).toEqual(["SPY"]);
    expect(newsProviderFromMoniker("news/gdelt")).toBe("gdelt");
    expect(newsTopicFromMoniker("news/gdelt")).toBeUndefined();
  });

  it("builds provider-aware API paths", () => {
    expect(newsApiPath("news/gdelt", ["SPY"], 20)).toBe(
      "/api/news?symbols=SPY&limit=20&provider=gdelt",
    );
    expect(newsApiPath("news.company/AAPL", ["AAPL"], 5)).toBe(
      "/api/news?symbols=AAPL&limit=5&provider=openbb",
    );
  });
});
