import fs from 'node:fs';
import path from 'node:path';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { strToU8, unzipSync, zipSync } from 'fflate';

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

export function writeResultsToWorkbook(workbookPath, results) {
  const resolvedPath = path.resolve(workbookPath);
  const parser = new XMLParser({ ignoreAttributes: false });
  const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
  const archive = unzipSync(fs.readFileSync(resolvedPath));
  const sheetXml = decodeArchiveEntry(archive['xl/worksheets/sheet1.xml']);
  const sharedStringsXml = decodeArchiveEntry(archive['xl/sharedStrings.xml']);

  if (!sheetXml) {
    throw new Error(`Worksheet xl/worksheets/sheet1.xml not found in ${resolvedPath}`);
  }

  const sharedStrings = sharedStringsXml
    ? toArray(parser.parse(sharedStringsXml).sst.si).map((entry) => collectText(entry))
    : [];
  const worksheet = parser.parse(sheetXml);
  const rows = toArray(worksheet.worksheet.sheetData.row);
  const resultsBySku = new Map(results.map((item) => [item.sku, item]));
  const headers = ['Price Match', 'Image Showing', 'Status'];
  const startColumnIndex = 1;

  upsertCell(rows[0], startColumnIndex, headers[0]);
  upsertCell(rows[0], startColumnIndex + 1, headers[1]);
  upsertCell(rows[0], startColumnIndex + 2, headers[2]);

  for (const row of rows.slice(1)) {
    const rowCells = toArray(row.c);
    const skuCell = rowCells[0];
    const sku = readCellValue(skuCell, sharedStrings);
    if (!sku) {
      continue;
    }

    const result = resultsBySku.get(sku);
    if (!result) {
      continue;
    }

    const imageShowing =
      result.checks?.['Image Showing Search List'] === 'Pass' &&
      result.checks?.['PDP Image Showing'] === 'Pass'
        ? 'Pass'
        : 'Fail';

    upsertCell(row, startColumnIndex, result.checks?.['Price Match'] ?? '');
    upsertCell(row, startColumnIndex + 1, imageShowing);
    upsertCell(row, startColumnIndex + 2, result.status === 'passed' ? 'Pass' : 'Fail');
  }

  worksheet.worksheet.sheetData.row = rows;
  const lastRowNumber = rows.length;
  const lastColumnLetter = columnIndexToLetter(startColumnIndex + headers.length - 1);
  worksheet.worksheet.dimension = { '@_ref': `A1:${lastColumnLetter}${lastRowNumber}` };

  archive['xl/worksheets/sheet1.xml'] = strToU8(builder.build(worksheet));

  fs.writeFileSync(resolvedPath, Buffer.from(zipSync(archive)));
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

function readCellValue(cell, sharedStrings = []) {
  if (!cell) {
    return '';
  }

  if (cell['@_t'] === 'inlineStr') {
    return normalizeCellValue(collectText(cell.is));
  }

  if (cell['@_t'] === 's') {
    return normalizeCellValue(sharedStrings[Number(cell.v)] ?? '');
  }

  return normalizeCellValue(cell.v ?? '');
}

function upsertCell(row, columnIndex, value) {
  const cells = toArray(row.c);
  const ref = `${columnIndexToLetter(columnIndex)}${row['@_r']}`;
  const existingIndex = cells.findIndex((cell) => cell['@_r'] === ref);
  const nextCell = {
    '@_r': ref,
    '@_t': 'inlineStr',
    is: {
      t: String(value ?? '')
    }
  };

  if (existingIndex >= 0) {
    cells[existingIndex] = nextCell;
  } else {
    cells.push(nextCell);
    cells.sort((left, right) => {
      const leftIndex = letterToColumnIndex(left['@_r'].replace(/\d+/g, ''));
      const rightIndex = letterToColumnIndex(right['@_r'].replace(/\d+/g, ''));
      return leftIndex - rightIndex;
    });
  }

  row.c = cells;
  row['@_spans'] = `1:${Math.max(...cells.map((cell) => letterToColumnIndex(cell['@_r'].replace(/\d+/g, '')) + 1))}`;
}

function columnIndexToLetter(index) {
  let value = index + 1;
  let output = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function letterToColumnIndex(letters) {
  let result = 0;
  for (const char of letters) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

function normalizeCellValue(value) {
  return String(value ?? '').replace(/\u00a0/g, '').trim();
}
