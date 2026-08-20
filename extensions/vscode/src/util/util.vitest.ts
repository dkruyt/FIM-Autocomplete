import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  extensions: {
    getExtension: vi.fn(),
  },
}));

describe("isExtensionPrerelease", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("detects prerelease versions correctly", async () => {
    const vscode = await import("vscode");
    const getExtensionMock = vi.mocked(vscode.extensions.getExtension);

    // 1.0.0 is not prerelease (even minor version)
    getExtensionMock.mockReturnValue({
      packageJSON: { version: "1.0.0" },
    } as any);

    const { isExtensionPrerelease } = await import("./util");

    expect(isExtensionPrerelease()).toBe(false);

    // 1.1.0 is prerelease (odd minor version)
    getExtensionMock.mockReturnValue({
      packageJSON: { version: "1.1.0" },
    } as any);

    expect(isExtensionPrerelease()).toBe(true);
  });
});
