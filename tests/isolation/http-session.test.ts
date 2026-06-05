import { describe, it, expect } from "vitest";
import {
  detectCabinet,
  isSessionAuthorized,
  type SessionIdentity,
} from "../../src/http-session.js";
import type { Config } from "../../src/config.js";

const config = {
  KADAM_ADV_DOMAIN: "https://partners.kadam.net",
  KADAM_PUB_DOMAIN: "https://pub.kadam.net",
} as Config;

describe("multi-tenant HTTP isolation", () => {
  describe("detectCabinet", () => {
    it("maps the advertiser host to adv", () => {
      expect(detectCabinet("partners.kadam.net", config)).toBe("adv");
      expect(detectCabinet("partners.kadam.net:443", config)).toBe("adv");
    });

    it("maps the publisher host to pub", () => {
      expect(detectCabinet("pub.kadam.net", config)).toBe("pub");
    });

    it("rejects unknown hosts", () => {
      expect(detectCabinet("evil.example.com", config)).toBeNull();
      expect(detectCabinet("", config)).toBeNull();
    });

    it("works with local dev domains from env", () => {
      const local = {
        KADAM_ADV_DOMAIN: "https://partners.kadam-docker.sdev.pw",
        KADAM_PUB_DOMAIN: "https://pub.kadam-docker.sdev.pw",
      } as Config;
      expect(detectCabinet("partners.kadam-docker.sdev.pw", local)).toBe("adv");
      expect(detectCabinet("pub.kadam-docker.sdev.pw", local)).toBe("pub");
      expect(detectCabinet("partners.kadam.net", local)).toBeNull();
    });
  });

  describe("isSessionAuthorized", () => {
    const session: SessionIdentity = { bearer: "token-A", cabinet: "adv" };

    it("authorizes the exact bearer + cabinet that created the session", () => {
      expect(isSessionAuthorized(session, "token-A", "adv")).toBe(true);
    });

    it("rejects a different partner's bearer on the same session (no cross-token reuse)", () => {
      expect(isSessionAuthorized(session, "token-B", "adv")).toBe(false);
    });

    it("rejects reusing an advertiser session on the publisher cabinet", () => {
      expect(isSessionAuthorized(session, "token-A", "pub")).toBe(false);
    });

    it("rejects when both bearer and cabinet differ", () => {
      expect(isSessionAuthorized(session, "token-B", "pub")).toBe(false);
    });

    it("isolates publisher sessions symmetrically", () => {
      const pubSession: SessionIdentity = { bearer: "pub-token", cabinet: "pub" };
      expect(isSessionAuthorized(pubSession, "pub-token", "pub")).toBe(true);
      expect(isSessionAuthorized(pubSession, "pub-token", "adv")).toBe(false);
      expect(isSessionAuthorized(pubSession, "other", "pub")).toBe(false);
    });
  });
});
