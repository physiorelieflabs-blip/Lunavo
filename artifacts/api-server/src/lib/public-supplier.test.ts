import { describe, expect, it } from "vitest";
import { isBlockedSupplierAddress, usesStandardHttpPort } from "./public-supplier";
import { isSafeRasterImageType, matchesRasterImageSignature } from "./image-safety";
describe("public supplier address policy", () => {
  it.each([
    "0.0.0.0","10.0.0.1","100.64.0.1","100.127.255.254","127.0.0.1","169.254.169.254",
    "172.16.0.1","192.0.0.8","192.0.2.5","192.88.99.1","192.168.1.1","198.18.0.1",
    "198.51.100.10","203.0.113.10","224.0.0.1","255.255.255.255","::","::1",
    "::ffff:127.0.0.1","fc00::1","fd12:3456::1","fe80::1","fe90::1","feb0::1","ff02::1",
    "2001:db8::1","2001:0::1","2001:2::1","2001:10::1","2001:11::1","2001:20::1","2001:2f::1"
  ])("blocks non-public address %s", (address) => expect(isBlockedSupplierAddress(address)).toBe(true));
  it.each(["8.8.8.8","1.1.1.1","93.184.216.34","2606:4700:4700::1111","2001:4860:4860::8888"])(
    "allows global public address %s", (address) => expect(isBlockedSupplierAddress(address)).toBe(false));
  it("fails closed for malformed addresses", () => expect(isBlockedSupplierAddress("not-an-ip")).toBe(true));
});


describe("safe image inputs for self-hosted vision", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"])(
    "allows raster media type %s",
    (type) => expect(isSafeRasterImageType(type)).toBe(true),
  );

  it.each(["image/svg+xml", "text/html", "application/octet-stream", "image/unknown"])(
    "rejects active or unsupported media type %s",
    (type) => expect(isSafeRasterImageType(type)).toBe(false),
  );

  it("requires image bytes to match the declared JPEG type", () => {
    expect(matchesRasterImageSignature("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe(true);
    expect(matchesRasterImageSignature("image/jpeg", Buffer.from("<html>not an image</html>"))).toBe(false);
    expect(matchesRasterImageSignature("image/svg+xml", Buffer.from("<svg/>"))).toBe(false);
  });

  it("rejects mismatched PNG and WebP signatures", () => {
    expect(matchesRasterImageSignature("image/png", Buffer.from("not a png"))).toBe(false);
    expect(matchesRasterImageSignature("image/webp", Buffer.from("RIFFxxxxWAVE"))).toBe(false);
    expect(matchesRasterImageSignature("image/webp", Buffer.from("RIFFxxxxWEBP"))).toBe(true);
  });
});


describe("public supplier URL transport policy", () => {
  it.each([
    ["https://shop.example/product/1", true],
    ["https://shop.example:443/product/1", true],
    ["http://shop.example/product/1", true],
    ["http://shop.example:80/product/1", true],
    ["http://shop.example:8080/product/1", false],
    ["https://shop.example:8443/product/1", false],
    ["ftp://shop.example/product/1", false],
    ["not a URL", false],
  ])("applies standard HTTP port policy to %s", (url, expected) => {
    expect(usesStandardHttpPort(url)).toBe(expected);
  });
});
