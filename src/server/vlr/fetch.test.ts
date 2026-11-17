import { expect, test } from "vitest";
import { createDb } from "../db/client.js";
import { createThrottledDownloader, fetchPage } from "./fetch.js";

test("downloads one at a time, at least 3 seconds apart", async () => {
  let virtualNow = 0;
  const startedAt: number[] = [];
  const download = createThrottledDownloader({
    now: () => virtualNow,
    sleep: async (ms) => {
      virtualNow += ms;
    },
    download: async (url) => {
      startedAt.push(virtualNow);
      virtualNow += 500;
      return { contentType: "text/html", bytes: Buffer.from(url) };
    },
  });

  await Promise.all(["a", "b", "c"].map((url) => download(url)));

  expect(startedAt).toEqual([0, 3500, 7000]);
});

test("fetchPage serves the cached copy unless asked to refresh", async () => {
  const db = createDb(":memory:");
  let downloads = 0;
  const download = async () => {
    downloads += 1;
    return { contentType: "text/html", bytes: Buffer.from(`v${downloads}`) };
  };
  const url = "https://www.vlr.gg/team/1/x";

  expect(await fetchPage({ db, download, refresh: false }, url)).toBe("v1");
  expect(await fetchPage({ db, download, refresh: false }, url)).toBe("v1");
  expect(await fetchPage({ db, download, refresh: true }, url)).toBe("v2");
  expect(await fetchPage({ db, download, refresh: false }, url)).toBe("v2");
  expect(downloads).toBe(2);
});
