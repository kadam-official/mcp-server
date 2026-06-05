import { parseImageDimensions } from "../../../src/tools/advertiser/creatives.js";

describe("parseImageDimensions", () => {
  it("parses PNG dimensions from IHDR chunk", () => {
    // Minimal PNG header: 89 50 4E 47 0D 0A 1A 0A + IHDR length (13) + IHDR type
    // then width (4 bytes) and height (4 bytes) at offsets 16 and 20
    const buf = new Uint8Array(24);
    buf[0] = 0x89;
    buf[1] = 0x50; // PNG magic
    // Width = 300 (0x0000012C) at offset 16
    buf[16] = 0x00;
    buf[17] = 0x00;
    buf[18] = 0x01;
    buf[19] = 0x2c;
    // Height = 250 (0x000000FA) at offset 20
    buf[20] = 0x00;
    buf[21] = 0x00;
    buf[22] = 0x00;
    buf[23] = 0xfa;
    expect(parseImageDimensions(buf)).toEqual({ width: 300, height: 250 });
  });

  it("parses JPEG dimensions from SOF0 marker", () => {
    // FF D8 (JPEG magic) then SOF0 marker: FF C0, length, precision, height, width
    const buf = new Uint8Array(12);
    buf[0] = 0xff;
    buf[1] = 0xd8; // JPEG magic
    buf[2] = 0xff;
    buf[3] = 0xc0; // SOF0 marker
    buf[4] = 0x00;
    buf[5] = 0x11; // segment length
    buf[6] = 0x08; // precision
    // Height = 480 (0x01E0) at offset 7
    buf[7] = 0x01;
    buf[8] = 0xe0;
    // Width = 640 (0x0280) at offset 9
    buf[9] = 0x02;
    buf[10] = 0x80;
    expect(parseImageDimensions(buf)).toEqual({ width: 640, height: 480 });
  });

  it("returns 0x0 for unknown formats", () => {
    const buf = new Uint8Array([0x47, 0x49, 0x46]); // GIF header
    expect(parseImageDimensions(buf)).toEqual({ width: 0, height: 0 });
  });

  it("returns 0x0 for empty data", () => {
    expect(parseImageDimensions(new Uint8Array(0))).toEqual({ width: 0, height: 0 });
  });

  it("parses JPEG with SOF2 (progressive) marker", () => {
    const buf = new Uint8Array(12);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    buf[3] = 0xc2; // SOF2 (progressive)
    buf[4] = 0x00;
    buf[5] = 0x11;
    buf[6] = 0x08;
    buf[7] = 0x00;
    buf[8] = 0xc8; // height = 200
    buf[9] = 0x01;
    buf[10] = 0x90; // width = 400
    expect(parseImageDimensions(buf)).toEqual({ width: 400, height: 200 });
  });
});
