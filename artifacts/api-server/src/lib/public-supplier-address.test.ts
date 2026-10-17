import { describe, expect, it } from "vitest";
import { isBlockedSupplierAddress } from "./public-supplier";

describe("public supplier URL address boundary", () => {
  it("allows representative globally routable IPv4 and IPv6 addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"]) {
      expect(isBlockedSupplierAddress(address), address).toBe(false);
    }
  });

  it("blocks private, loopback, link-local and carrier-grade NAT IPv4 ranges", () => {
    for (const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "100.127.255.254",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.1",
    ]) {
      expect(isBlockedSupplierAddress(address), address).toBe(true);
    }
  });

  it("blocks special-purpose, documentation, benchmark, multicast and reserved IPv4 ranges", () => {
    for (const address of [
      "192.0.0.8",
      "192.0.2.1",
      "192.88.99.1",
      "198.18.0.1",
      "198.19.255.254",
      "198.51.100.7",
      "203.0.113.8",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedSupplierAddress(address), address).toBe(true);
    }
  });

  it("blocks non-global IPv6, mapped IPv4, transition and special-purpose ranges", () => {
    for (const address of [
      "::",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2000::1",
      "2001:0::1",
      "2001:1::1",
      "2001:2::1",
      "2001:db8::1",
      "2001:10::1",
      "2001:20::1",
      "2002:0808:0808::1",
      "2d00::1",
      "3000::1",
      "3f00::1",
      "3fff::1",
    ]) {
      expect(isBlockedSupplierAddress(address), address).toBe(true);
    }
  });

  it("fails closed on malformed addresses and IPv6 zone identifiers", () => {
    for (const address of ["", "not-an-ip", "127.1", "fe80::1%eth0", "[::1]"]) {
      expect(isBlockedSupplierAddress(address), address).toBe(true);
    }
  });
});
