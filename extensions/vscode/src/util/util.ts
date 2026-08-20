import * as vscode from "vscode";

import { EXTENSION_ID } from "./constants";

export function getExtensionVersion(): string {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  return extension?.packageJSON.version || "0.2.5";
}

export function isExtensionPrerelease(): boolean {
  const extensionVersion = getExtensionVersion();
  const versionParts = extensionVersion.split(".");
  if (versionParts.length >= 2) {
    const minorVersion = parseInt(versionParts[1], 10);
    if (!isNaN(minorVersion)) {
      return minorVersion % 2 !== 0;
    }
  }
  return false;
}
