import { describe, expect, it } from "vitest";
import { isBlockedSupplierAddress } from "./public-supplier";
describe("public supplier address policy", () => {
  it.each([
    "0.0.0.0","10.0.0.1","100.64.0.1","100.127.255.254","127.0.0.1","169.254.169.254",
    "172.16.0.1","192.0.0.8","192.0.2.5","192.88.99.1","192.168.1.1","198.18.0.1",
    "198.51.100.10","203.0.113.10","224.0.0.1","255.255.255.255","::","::1",
    "::ffff:127.0.0.1","fc00::1","fd12:3456::1","fe80::1","fe90::1","feb0::1","ff02::1",
    "2001:db8::1","2001:0::1","2001:2::1"
  ])("blocks non-public address %s", (address) => expect(isBlockedSupplierAddress(address)).toBe(true));
  it.each(["8.8.8.8","1.1.1.1","93.184.216.34","2606:4700:4700::1111","2001:4860:4860::8888"])(
    "allows global public address %s", (address) => expect(isBlockedSupplierAddress(address)).toBe(false));
  it("fails closed for malformed addresses", () => expect(isBlockedSupplierAddress("not-an-ip")).toBe(true));
});
