import { describe, it, expect } from "vitest";
import {
  detectCabinet,
  isSessionAuthorized,
  type SessionIdentity,
} from "../../src/http-session.js";
import { buildPrm } from "../../src/http-bootstrap.js";
import type { Config } from "../../src/config.js";

const configWithMcpSubdomains = {
  KADAM_ADV_DOMAIN: "https://partners.kadam.net",
  KADAM_PUB_DOMAIN: "https://pub.kadam.net",
  KADAM_ADV_MCP_DOMAIN: "https://partners-mcp.kadam.net",
  KADAM_PUB_MCP_DOMAIN: "https://pub-mcp.kadam.net",
} as Config;

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

    it("maps dedicated MCP subdomains to their cabinet (and cabinet hosts still resolve)", () => {
      expect(detectCabinet("partners-mcp.kadam.net", configWithMcpSubdomains)).toBe("adv");
      expect(detectCabinet("pub-mcp.kadam.net", configWithMcpSubdomains)).toBe("pub");
      // the OAuth AS still lives on the cabinet host, so it must resolve too
      expect(detectCabinet("partners.kadam.net", configWithMcpSubdomains)).toBe("adv");
      expect(detectCabinet("pub.kadam.net", configWithMcpSubdomains)).toBe("pub");
      expect(detectCabinet("mcp.evil.com", configWithMcpSubdomains)).toBeNull();
    });
  });

  describe("buildPrm (RFC 9728 resource / AS split)", () => {
    it("keeps resource and AS on the cabinet host when no MCP domain is set", () => {
      expect(buildPrm(config, "adv")).toEqual({
        resource: "https://partners.kadam.net/mcp",
        authorization_servers: ["https://partners.kadam.net"],
        bearer_methods_supported: ["header"],
      });
    });

    it("points resource at the MCP subdomain but keeps AS on the cabinet host", () => {
      expect(buildPrm(configWithMcpSubdomains, "adv")).toEqual({
        resource: "https://partners-mcp.kadam.net/mcp",
        authorization_servers: ["https://partners.kadam.net"],
        bearer_methods_supported: ["header"],
      });
      expect(buildPrm(configWithMcpSubdomains, "pub")).toEqual({
        resource: "https://pub-mcp.kadam.net/mcp",
        authorization_servers: ["https://pub.kadam.net"],
        bearer_methods_supported: ["header"],
      });
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
