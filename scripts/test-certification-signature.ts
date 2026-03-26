/**
 * Test Script: Generate Certified PDF for Adobe Acrobat Testing
 *
 * Run with: npx tsx scripts/test-certification-signature.ts
 *
 * This creates a PDF with a proper certification signature that should
 * show the blue ribbon in Adobe Acrobat Pro/Reader.
 *
 * Requirements:
 * - /Type /Sig with /Filter /Adobe.PPKLite, /SubFilter /adbe.pkcs7.detached
 * - /Reference with /TransformMethod /DocMDP
 * - /Perms << /DocMDP sigRef >> in Catalog
 * - /AcroForm with /SigFlags 3
 * - Proper ByteRange covering entire PDF
 * - Valid PKCS#7/CMS signature
 */

import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';

// Constants
const SIGNATURE_LENGTH = 8192;
const SIGNATURE_PLACEHOLDER = '0'.repeat(SIGNATURE_LENGTH * 2);
const CERT_ENCRYPTION_KEY = 'pearsign-cert-key-2024';

// Certificate generation
function generateTestCertificate() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.serialNumber = Date.now().toString(16) + forge.util.bytesToHex(forge.random.getBytesSync(8));

  const now = new Date();
  const validTo = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  cert.validity.notBefore = now;
  cert.validity.notAfter = validTo;

  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: 'PearSign Test Certificate' },
    { name: 'organizationName', value: 'PearSign Electronic Signatures' },
    { shortName: 'C', value: 'US' },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.publicKey = keys.publicKey;

  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true, critical: true },
    { name: 'extKeyUsage', emailProtection: true },
    { name: 'subjectKeyIdentifier' },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certificate: forge.pki.certificateToPem(cert),
    privateKey: forge.pki.encryptRsaPrivateKey(keys.privateKey, CERT_ENCRYPTION_KEY),
    publicKey: forge.pki.publicKeyToPem(keys.publicKey),
  };
}

// Helper functions
function formatPdfDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapePdfString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createPkcs7Signature(
  certificate: ReturnType<typeof generateTestCertificate>,
  dataToSign: Buffer,
  signedAt: Date
): Buffer {
  const cert = forge.pki.certificateFromPem(certificate.certificate);
  const privateKey = forge.pki.decryptRsaPrivateKey(certificate.privateKey, CERT_ENCRYPTION_KEY);

  if (!privateKey) {
    throw new Error('Failed to decrypt private key');
  }

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(dataToSign.toString('binary'));
  p7.addCertificate(cert);

  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: signedAt as unknown as string },
    ],
  });

  p7.sign({ detached: true });

  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
}

// Create minimal PDF without object streams
function createMinimalPDF(): Buffer {
  const pdf = `%PDF-1.7
%\xE2\xE3\xCF\xD3

1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Resources <<
/Font <<
/F1 4 0 R
>>
>>
/Contents 5 0 R
>>
endobj

4 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj

5 0 obj
<<
/Length 180
>>
stream
BT
/F1 24 Tf
50 700 Td
(PearSign Certification Test) Tj
0 -40 Td
/F1 12 Tf
(This document tests Adobe Acrobat certification signatures.) Tj
0 -460 Td
(Owner Signature: ___________________________) Tj
ET
endstream
endobj

xref
0 6
0000000000 65535 f
0000000015 00000 n
0000000066 00000 n
0000000125 00000 n
0000000291 00000 n
0000000375 00000 n
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
608
%%EOF
`;

  return Buffer.from(pdf, 'latin1');
}

// Main signing function
async function signPdfWithCertification(
  pdfBytes: Buffer,
  certificate: ReturnType<typeof generateTestCertificate>,
  signerName: string,
  signedAt: Date
): Promise<Buffer> {
  const pdfStr = pdfBytes.toString('latin1');

  // Parse PDF structure
  const maxObjMatches = [...pdfStr.matchAll(/(\d+)\s+0\s+obj/g)];
  let maxObjNum = 0;
  for (const match of maxObjMatches) {
    const num = parseInt(match[1], 10);
    if (num > maxObjNum) maxObjNum = num;
  }

  const catalogMatch = pdfStr.match(/\/Root\s+(\d+)\s+0\s+R/);
  const catalogObjNum = catalogMatch ? parseInt(catalogMatch[1], 10) : 1;

  const xrefMatches = [...pdfStr.matchAll(/startxref\s+(\d+)/g)];
  const prevXref = xrefMatches.length > 0 ? parseInt(xrefMatches[xrefMatches.length - 1][1], 10) : 0;

  // Find page object
  const pageTypeMatches = [...pdfStr.matchAll(/\/Type\s*\/Page(?!s)/g)];
  let firstPageObjNum = 3;
  for (const match of pageTypeMatches) {
    const idx = match.index;
    if (idx === undefined) continue;
    const before = pdfStr.substring(0, idx);
    const objMatches = [...before.matchAll(/(\d+)\s+0\s+obj/g)];
    if (objMatches.length > 0) {
      firstPageObjNum = parseInt(objMatches[objMatches.length - 1][1], 10);
      break;
    }
  }

  const sigObjNum = maxObjNum + 1;
  const widgetObjNum = maxObjNum + 2;
  const pdfDate = formatPdfDate(signedAt);

  // Build Sig object
  let sigObj = `${sigObjNum} 0 obj\n`;
  sigObj += '<<\n';
  sigObj += '/Type /Sig\n';
  sigObj += '/Filter /Adobe.PPKLite\n';
  sigObj += '/SubFilter /adbe.pkcs7.detached\n';
  sigObj += '/ByteRange [0 0000000000 0000000000 0000000000]\n';
  sigObj += `/Contents <${SIGNATURE_PLACEHOLDER}>\n`;
  sigObj += `/Name (${escapePdfString(signerName)})\n`;
  sigObj += `/M (${pdfDate})\n`;
  sigObj += '/Reason (Document certified by PearSign)\n';
  sigObj += '/Location (PearSign)\n';
  sigObj += '/Reference [<<\n';
  sigObj += '/Type /SigRef\n';
  sigObj += '/TransformMethod /DocMDP\n';
  sigObj += '/TransformParams <<\n';
  sigObj += '/Type /TransformParams\n';
  sigObj += '/P 1\n';
  sigObj += '/V /1.2\n';
  sigObj += '>> >>]\n';
  sigObj += '>>\n';
  sigObj += 'endobj\n';

  // Build Widget annotation
  let widgetObj = `${widgetObjNum} 0 obj\n`;
  widgetObj += '<<\n';
  widgetObj += '/Type /Annot\n';
  widgetObj += '/Subtype /Widget\n';
  widgetObj += '/FT /Sig\n';
  widgetObj += '/T (Signature1)\n';
  widgetObj += '/F 132\n';
  widgetObj += `/V ${sigObjNum} 0 R\n`;
  widgetObj += `/P ${firstPageObjNum} 0 R\n`;
  widgetObj += '/Rect [0 0 0 0]\n';
  widgetObj += '>>\n';
  widgetObj += 'endobj\n';

  // Extract and update page object with proper nested dict handling
  const pageObjStart = pdfStr.indexOf(`${firstPageObjNum} 0 obj`);
  let pageObjContent = '';

  if (pageObjStart !== -1) {
    const afterObj = pdfStr.substring(pageObjStart);
    const dictStart = afterObj.indexOf('<<');
    if (dictStart !== -1) {
      let depth = 0;
      let pos = dictStart;
      let dictEnd = -1;

      while (pos < afterObj.length - 1) {
        if (afterObj[pos] === '<' && afterObj[pos + 1] === '<') {
          depth++;
          pos += 2;
        } else if (afterObj[pos] === '>' && afterObj[pos + 1] === '>') {
          depth--;
          if (depth === 0) {
            dictEnd = pos + 2;
            break;
          }
          pos += 2;
        } else {
          pos++;
        }
      }

      if (dictEnd > 0) {
        pageObjContent = afterObj.substring(dictStart + 2, dictEnd - 2);
      }
    }
  }

  let updatedPage = '';
  if (pageObjContent) {
    pageObjContent = pageObjContent.trimEnd() + `\n/Annots [${widgetObjNum} 0 R]`;
    updatedPage = `${firstPageObjNum} 0 obj\n<<${pageObjContent}>>\nendobj\n`;
  } else {
    updatedPage = `${firstPageObjNum} 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Annots [${widgetObjNum} 0 R]\n>>\nendobj\n`;
  }

  // Extract and update catalog object
  const catalogObjStart = pdfStr.indexOf(`${catalogObjNum} 0 obj`);
  let catalogContent = '';

  if (catalogObjStart !== -1) {
    const afterObj = pdfStr.substring(catalogObjStart);
    const dictStart = afterObj.indexOf('<<');
    if (dictStart !== -1) {
      let depth = 0;
      let pos = dictStart;
      let dictEnd = -1;

      while (pos < afterObj.length - 1) {
        if (afterObj[pos] === '<' && afterObj[pos + 1] === '<') {
          depth++;
          pos += 2;
        } else if (afterObj[pos] === '>' && afterObj[pos + 1] === '>') {
          depth--;
          if (depth === 0) {
            dictEnd = pos + 2;
            break;
          }
          pos += 2;
        } else {
          pos++;
        }
      }

      if (dictEnd > 0) {
        catalogContent = afterObj.substring(dictStart + 2, dictEnd - 2);
      }
    }
  }

  if (!catalogContent) {
    catalogContent = '/Type /Catalog\n/Pages 2 0 R\n';
  }

  let updatedCatalog = `${catalogObjNum} 0 obj\n`;
  updatedCatalog += '<<' + catalogContent.trim() + '\n';
  updatedCatalog += '/AcroForm <<\n';
  updatedCatalog += `/Fields [${widgetObjNum} 0 R]\n`;
  updatedCatalog += '/SigFlags 3\n';
  updatedCatalog += '>>\n';
  updatedCatalog += '/Perms <<\n';
  updatedCatalog += `/DocMDP ${sigObjNum} 0 R\n`;
  updatedCatalog += '>>\n';
  updatedCatalog += '>>\n';
  updatedCatalog += 'endobj\n';

  // Calculate offsets
  const insertOffset = pdfBytes.length;
  const needsNewline = pdfBytes[pdfBytes.length - 1] !== 0x0A;
  const prefix = needsNewline ? '\n' : '';

  const sigObjOffset = insertOffset + Buffer.byteLength(prefix, 'latin1');
  const widgetObjOffset = sigObjOffset + Buffer.byteLength(sigObj, 'latin1');
  const pageObjOffset = widgetObjOffset + Buffer.byteLength(widgetObj, 'latin1');
  const catalogObjOffset = pageObjOffset + Buffer.byteLength(updatedPage, 'latin1');
  const xrefOffset = catalogObjOffset + Buffer.byteLength(updatedCatalog, 'latin1');

  // Build xref
  let xref = 'xref\n';
  xref += '0 1\n';
  xref += '0000000000 65535 f \n';
  xref += `${catalogObjNum} 1\n`;
  xref += `${catalogObjOffset.toString().padStart(10, '0')} 00000 n \n`;
  xref += `${firstPageObjNum} 1\n`;
  xref += `${pageObjOffset.toString().padStart(10, '0')} 00000 n \n`;
  xref += `${sigObjNum} 2\n`;
  xref += `${sigObjOffset.toString().padStart(10, '0')} 00000 n \n`;
  xref += `${widgetObjOffset.toString().padStart(10, '0')} 00000 n \n`;
  xref += 'trailer\n';
  xref += '<<\n';
  xref += `/Size ${widgetObjNum + 1}\n`;
  xref += `/Root ${catalogObjNum} 0 R\n`;
  xref += `/Prev ${prevXref}\n`;
  xref += '>>\n';
  xref += 'startxref\n';
  xref += `${xrefOffset}\n`;
  xref += '%%EOF\n';

  // Assemble PDF with placeholder
  const incrementalUpdate = prefix + sigObj + widgetObj + updatedPage + updatedCatalog + xref;
  const updateBuffer = Buffer.from(incrementalUpdate, 'latin1');
  const pdf = Buffer.concat([pdfBytes, updateBuffer]);
  const totalLength = pdf.length;

  // Find Contents position and calculate ByteRange
  const contentsMarker = Buffer.from('/Contents <', 'latin1');
  const contentsMarkerPos = pdf.indexOf(contentsMarker, sigObjOffset);

  if (contentsMarkerPos === -1) {
    throw new Error('Could not find /Contents marker');
  }

  const contentsStart = contentsMarkerPos + 10;
  const contentsHexStart = contentsStart + 1;
  const contentsHexEnd = contentsHexStart + SIGNATURE_PLACEHOLDER.length;
  const contentsEnd = contentsHexEnd + 1;

  const byteRange = [0, contentsStart, contentsEnd, totalLength - contentsEnd];

  // Update ByteRange in PDF
  const byteRangeStr = `${byteRange[0]} ${byteRange[1].toString().padStart(10, '0')} ${byteRange[2].toString().padStart(10, '0')} ${byteRange[3].toString().padStart(10, '0')}`;
  const byteRangePlaceholder = '/ByteRange [0 0000000000 0000000000 0000000000]';
  const byteRangeMarkerPos = pdf.indexOf(Buffer.from(byteRangePlaceholder, 'latin1'), sigObjOffset);

  if (byteRangeMarkerPos === -1) {
    throw new Error('Could not find ByteRange placeholder');
  }

  const byteRangeValueOffset = byteRangeMarkerPos + 12;
  Buffer.from(byteRangeStr, 'latin1').copy(pdf, byteRangeValueOffset);

  // Hash and sign
  const segment1 = pdf.subarray(byteRange[0], byteRange[0] + byteRange[1]);
  const segment2 = pdf.subarray(byteRange[2], byteRange[2] + byteRange[3]);
  const dataToHash = Buffer.concat([segment1, segment2]);

  const pkcs7Signature = createPkcs7Signature(certificate, dataToHash, signedAt);

  if (pkcs7Signature.length > SIGNATURE_LENGTH) {
    throw new Error(`Signature too large: ${pkcs7Signature.length} > ${SIGNATURE_LENGTH}`);
  }

  // Insert signature
  const signatureHex = pkcs7Signature.toString('hex').toUpperCase();
  const paddedSignatureHex = signatureHex.padEnd(SIGNATURE_PLACEHOLDER.length, '0');
  Buffer.from(paddedSignatureHex, 'latin1').copy(pdf, contentsHexStart);

  return pdf;
}

// Main execution
async function main() {
  console.log('='.repeat(60));
  console.log('PearSign - PDF Certification Signature Test');
  console.log('='.repeat(60));

  console.log('\n1. Creating test PDF...');
  const pdfBytes = createMinimalPDF();
  console.log(`   Original PDF: ${pdfBytes.length} bytes`);

  console.log('\n2. Generating test certificate...');
  const certificate = generateTestCertificate();
  console.log('   Certificate generated');

  console.log('\n3. Applying certification signature...');
  const signedPdf = await signPdfWithCertification(
    pdfBytes,
    certificate,
    'PearSign Test User',
    new Date()
  );
  console.log(`   Signed PDF: ${signedPdf.length} bytes`);

  // Save to file
  const outputPath = path.join(process.cwd(), 'test-certified.pdf');
  fs.writeFileSync(outputPath, signedPdf);
  console.log(`\n4. Saved to: ${outputPath}`);

  // Verify structure
  console.log('\n5. Verifying PDF structure...');
  const pdfStr = signedPdf.toString('latin1');

  const checks = [
    { name: '/Type /Sig', ok: pdfStr.includes('/Type /Sig') },
    { name: '/Filter /Adobe.PPKLite', ok: pdfStr.includes('/Filter /Adobe.PPKLite') },
    { name: '/SubFilter /adbe.pkcs7.detached', ok: pdfStr.includes('/SubFilter /adbe.pkcs7.detached') },
    { name: '/TransformMethod /DocMDP', ok: pdfStr.includes('/TransformMethod /DocMDP') },
    { name: '/P 1', ok: pdfStr.includes('/P 1') },
    { name: '/Perms with /DocMDP', ok: pdfStr.includes('/Perms') && pdfStr.includes('/DocMDP') },
    { name: '/AcroForm with /SigFlags 3', ok: pdfStr.includes('/SigFlags 3') },
    { name: '/Rect [0 0 0 0]', ok: pdfStr.includes('/Rect [0 0 0 0]') },
  ];

  let allPassed = true;
  for (const check of checks) {
    console.log(`   ${check.ok ? '✓' : '✗'} ${check.name}`);
    if (!check.ok) allPassed = false;
  }

  console.log('\n' + '='.repeat(60));
  console.log(allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
  console.log('='.repeat(60));

  console.log('\n📋 Next Steps:');
  console.log('   1. Open test-certified.pdf in Adobe Acrobat Pro/Reader');
  console.log('   2. Look for blue certification ribbon at top');
  console.log('   3. Check Signature Panel (View > Show/Hide > Navigation Panes > Signatures)');
  console.log('   4. Signature should show as "Valid" with certification lock icon\n');
}

main().catch(console.error);
