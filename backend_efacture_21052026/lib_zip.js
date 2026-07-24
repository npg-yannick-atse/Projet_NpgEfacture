// Mini écrivain ZIP (méthode STORE) — suffisant pour produire un .xlsx valide sans dépendance.
'use strict';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name: 'path/in/zip', data: Buffer|string }]
function zip(files) {
  const entries = files.map(f => ({
    name: f.name,
    data: Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8')
  }));

  const chunks = [];
  const central = [];
  let offset = 0;

  // Date/heure fixes (évite Date.now, indisponible ici) : 2026-01-01 00:00
  const dosTime = 0;                       // 00:00:00
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(0, 8);           // method = store
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);       // compressed
    local.writeUInt32LE(size, 22);       // uncompressed
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra len

    chunks.push(local, nameBuf, e.data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);   // version made by
    cd.writeUInt16LE(20, 6);   // version needed
    cd.writeUInt16LE(0, 8);    // flags
    cd.writeUInt16LE(0, 10);   // method
    cd.writeUInt16LE(dosTime, 12);
    cd.writeUInt16LE(dosDate, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);   // extra
    cd.writeUInt16LE(0, 32);   // comment
    cd.writeUInt16LE(0, 34);   // disk start
    cd.writeUInt16LE(0, 36);   // internal attr
    cd.writeUInt32LE(0, 38);   // external attr
    cd.writeUInt32LE(offset, 42); // local header offset
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + e.data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, eocd]);
}

module.exports = { zip, crc32 };
