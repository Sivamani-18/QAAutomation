import fs from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';

export function loadSkus(workbookPath, maxSkus = null) {
  const resolvedPath = path.resolve(workbookPath);
  const parser = new XMLParser({ ignoreAttributes: false });
  const archive = unzipSync(fs.readFileSync(resolvedPath));
  const sheetXml = decodeArchiveEntry(archive['xl/worksheets/sheet1.xml']);

  if (!sheetXml) {
    throw new Error(`Worksheet xl/worksheets/sheet1.xml not found in ${resolvedPath}`);
  }

  const sharedStringsXml = decodeArchiveEntry(archive['xl/sharedStrings.xml']);
  const sharedStrings = sharedStringsXml
    ? toArray(parser.parse(sharedStringsXml).sst.si).map((entry) => collectText(entry))
    : [];

  const worksheet = parser.parse(sheetXml);
  const rows = toArray(worksheet.worksheet.sheetData.row);
  const skus = rows
    .slice(1)
    .map((row) => {
      const cell = toArray(row.c)[0];
      if (!cell) {
        return '';
      }

      const rawValue = cell.v ?? '';
      const value = cell['@_t'] === 's' ? sharedStrings[Number(rawValue)] ?? '' : rawValue;
      return String(value).replace(/\u00a0/g, '').trim();
    })
    .filter(Boolean);

  if (skus.length === 0) {
    throw new Error(`No SKUs found in ${resolvedPath}`);
  }

  return maxSkus ? skus.slice(0, maxSkus) : skus;
}

function toArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function collectText(node) {
  if (typeof node === 'string') {
    return node;
  }
  if (!node || typeof node !== 'object') {
    return '';
  }
  return Object.values(node)
    .flatMap((value) => toArray(value))
    .map((value) => collectText(value))
    .join('');
}

function decodeArchiveEntry(entry) {
  if (!entry) {
    return '';
  }
  return new TextDecoder('utf-8').decode(entry);
}
