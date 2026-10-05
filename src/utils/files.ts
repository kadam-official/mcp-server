import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export interface LoadedFile {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
}

function isLocalPath(source: string): boolean {
  return source.startsWith("/") || source.startsWith("~") || source.startsWith("file://");
}

export async function loadFile(source: string): Promise<LoadedFile> {
  let buffer: ArrayBuffer;
  let filename: string;

  if (isLocalPath(source)) {
    const filePath = source.startsWith("file://")
      ? new URL(source).pathname
      : source.startsWith("~")
        ? source.replace("~", process.env.HOME || "")
        : source;
    const nodeBuffer = await readFile(filePath).catch(() => {
      throw new Error(`File not found or unreadable: ${filePath}`);
    });
    buffer = nodeBuffer.buffer.slice(
      nodeBuffer.byteOffset,
      nodeBuffer.byteOffset + nodeBuffer.byteLength,
    );
    filename = basename(filePath);
  } else {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to download file from ${source}: HTTP ${response.status}`);
    }
    buffer = await response.arrayBuffer();
    const urlPath = new URL(source).pathname;
    filename = urlPath.split("/").pop() || "file";
  }

  const blob = new Blob([buffer]);
  const { width, height } = parseImageDimensions(new Uint8Array(buffer));
  return { blob, filename, width, height };
}

export function parseImageDimensions(data: Uint8Array): { width: number; height: number } {
  if (data[0] === 0x89 && data[1] === 0x50) {
    const view = new DataView(data.buffer, data.byteOffset);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset < data.length - 9) {
      if (data[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = data[offset + 1]!;
      if (marker === 0xc0 || marker === 0xc2) {
        const view = new DataView(data.buffer, data.byteOffset);
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      const segLen = (data[offset + 2]! << 8) | data[offset + 3]!;
      offset += 2 + segLen;
    }
  }
  return { width: 0, height: 0 };
}
