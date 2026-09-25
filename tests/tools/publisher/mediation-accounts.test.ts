import { createToolClient, getTextFromResult } from "../../helpers/tool-client.js";
import { mediationModule } from "../../../src/tools/publisher/mediation.js";
import { mediationAccountsModule } from "../../../src/tools/publisher/mediation-accounts.js";

type MockPubClient = {
  listMediationAccounts: ReturnType<typeof vi.fn>;
  updateMediationAccount: ReturnType<typeof vi.fn>;
  deleteMediationAccount: ReturnType<typeof vi.fn>;
};

const ACCOUNT = {
  id: 11,
  networkId: 3,
  name: "Main",
  mask: "abc***xyz",
  active: true,
  createdAt: 1_700_000_000,
  verifiedAt: 1_700_000_100,
  lastError: null,
  placementsInUse: 1,
};

async function withAccounts(): Promise<{
  client: Awaited<ReturnType<typeof createToolClient>>["client"];
  api: MockPubClient;
}> {
  const { client, mockApi } = await createToolClient(mediationAccountsModule);
  return { client, api: mockApi as unknown as MockPubClient };
}

async function call(
  client: Awaited<ReturnType<typeof createToolClient>>["client"],
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  return getTextFromResult(await client.callTool({ name, arguments: args }));
}

describe("update_mediation_network_account", () => {
  /**
   * AccountForm требует networkId и name и на обновлении, а name пишется в строку как
   * есть: частичный PUT — это 422, пустое имя стёрло бы аккаунт.
   */
  it("rotates the key on top of the stored row, never echoing the key back", async () => {
    const { client, api } = await withAccounts();
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.updateMediationAccount.mockResolvedValue({ ...ACCOUNT, mask: "new***key" });

    const text = await call(client, "kadam_pub_update_mediation_network_account", {
      accountId: 11,
      apiKey: "brand-new-secret",
    });

    expect(api.updateMediationAccount).toHaveBeenCalledWith(11, {
      networkId: 3,
      name: "Main",
      active: true,
      apiKey: "brand-new-secret",
    });
    expect(text).not.toContain("brand-new-secret");
    expect(text).toContain("new***key");
  });

  it("disables the account without touching the stored key", async () => {
    const { client, api } = await withAccounts();
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);
    api.updateMediationAccount.mockResolvedValue({ ...ACCOUNT, active: false });

    await call(client, "kadam_pub_update_mediation_network_account", {
      accountId: 11,
      active: false,
    });

    const [, payload] = api.updateMediationAccount.mock.calls[0]!;
    expect(payload).toEqual({ networkId: 3, name: "Main", active: false });
    expect(payload).not.toHaveProperty("apiKey");
  });

  /** Бэкенд отдаёт lastError пустой строкой, а не null: у здорового аккаунта её быть не должно. */
  it("does not print an empty last error", async () => {
    const { client, api } = await withAccounts();
    api.listMediationAccounts.mockResolvedValue([{ ...ACCOUNT, lastError: "" }]);
    api.updateMediationAccount.mockResolvedValue({ ...ACCOUNT, lastError: "" });

    const text = await call(client, "kadam_pub_update_mediation_network_account", {
      accountId: 11,
      active: true,
    });

    expect(text).not.toContain("Last error");
  });

  it("reports an account that is not the publisher's", async () => {
    const { client, api } = await withAccounts();
    api.listMediationAccounts.mockResolvedValue([ACCOUNT]);

    const text = await call(client, "kadam_pub_update_mediation_network_account", {
      accountId: 999,
      active: false,
    });

    expect(text).toContain("999");
    expect(api.updateMediationAccount).not.toHaveBeenCalled();
  });
});

describe("delete_mediation_network_account", () => {
  it("requires confirm", async () => {
    const { client, api } = await withAccounts();

    const text = await call(client, "kadam_pub_delete_mediation_network_account", {
      accountId: 11,
    });

    expect(text).toMatch(/confirm/i);
    expect(api.deleteMediationAccount).not.toHaveBeenCalled();
  });

  it("removes the account once confirmed", async () => {
    const { client, api } = await withAccounts();
    api.deleteMediationAccount.mockResolvedValue({ deleted: true });

    const text = await call(client, "kadam_pub_delete_mediation_network_account", {
      accountId: 11,
      confirm: true,
    });

    expect(api.deleteMediationAccount).toHaveBeenCalledWith(11);
    expect(text).toMatch(/removed|deleted/i);
  });
});

describe("key handling across both mediation modules", () => {
  /**
   * Проверка должна видеть оба модуля: раньше она поднимала только основной и не замечала
   * бы, если инструкция «не спрашивать ключ» ушла из инструмента ротации.
   */
  it("tells the model never to read an existing key back", async () => {
    const seen: string[] = [];

    for (const module of [mediationModule, mediationAccountsModule]) {
      const { client } = await createToolClient(module);
      const { tools } = await client.listTools();

      const keyTakers = tools.filter((t) =>
        Object.keys(
          (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
        ).includes("apiKey"),
      );

      for (const tool of keyTakers) {
        seen.push(tool.name);
        expect(tool.description ?? "").toMatch(/never ask/i);
      }
    }

    expect(seen).toEqual([
      "kadam_pub_connect_mediation_network",
      "kadam_pub_update_mediation_network_account",
    ]);
  });
});
