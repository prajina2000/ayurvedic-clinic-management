import { strToU8, zipSync } from 'fflate';
import { CLINIC_MARK, CLINIC_NAME } from '../config/clinicBrand.js';

const xml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));

function columnName(index) {
  let name = '';
  let value = index + 1;
  while (value) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function logoBytes() {
  const base64 = CLINIC_MARK.slice(CLINIC_MARK.indexOf(',') + 1);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export function downloadBrandedExcel({ filename, sheetName, subtitle, headers, rows, widths = [], currencyColumns = [], numberColumns = [] }) {
  const safeSheetName = String(sheetName || 'Clinic report').slice(0, 31).replace(/[\\/*?:\[\]]/g, ' ');
  const lastColumn = columnName(headers.length - 1);
  const headerRow = 4;
  const dataEndRow = headerRow + rows.length;
  const makeCell = (value, address, style = 0) => {
    const styleAttribute = style ? ` s="${style}"` : '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${address}"${styleAttribute}><v>${value}</v></c>`;
    return `<c r="${address}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  };
  const titleCells = makeCell(CLINIC_NAME, 'C1', 4);
  const headerCells = headers.map((value, columnIndex) => makeCell(value, `${columnName(columnIndex)}${headerRow}`, 1)).join('');
  const dataRows = rows.map((row, rowIndex) => {
    const rowNumber = headerRow + rowIndex + 1;
    return `<row r="${rowNumber}">${row.map((value, columnIndex) => {
      const style = currencyColumns.includes(columnIndex) ? 2 : numberColumns.includes(columnIndex) ? 3 : 0;
      return makeCell(value, `${columnName(columnIndex)}${rowNumber}`, style);
    }).join('')}</row>`;
  }).join('');
  const columns = headers.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="${widths[index] || 18}" customWidth="1"/>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews><cols>${columns}</cols><sheetData><row r="1" ht="38" customHeight="1">${titleCells}</row><row r="2" ht="30" customHeight="1">${makeCell(`${subtitle || safeSheetName} · ${new Date().toLocaleDateString('en-IN')}`, 'C2', 5)}</row><row r="3" ht="12" customHeight="1"/><row r="${headerRow}">${headerCells}</row>${dataRows}</sheetData><mergeCells count="2"><mergeCell ref="C1:${lastColumn}1"/><mergeCell ref="C2:${lastColumn}2"/></mergeCells><autoFilter ref="A${headerRow}:${lastColumn}${Math.max(headerRow, dataEndRow)}"/><drawing r:id="rId1"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="₹#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF224C35"/><sz val="16"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF224C35"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="1040000" cy="1040000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Kariyil Krishna Clinic logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1040000" cy="1040000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': sheet,
    'xl/worksheets/_rels/sheet1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`,
    'xl/styles.xml': styles,
    'xl/drawings/drawing1.xml': drawing,
    'xl/drawings/_rels/drawing1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/clinic-mark.jpg"/></Relationships>`,
    'xl/media/clinic-mark.jpg': logoBytes(),
  };
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([path, contents]) => [path, typeof contents === 'string' ? strToU8(contents) : contents])));
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
