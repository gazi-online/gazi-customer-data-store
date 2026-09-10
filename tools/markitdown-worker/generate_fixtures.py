#!/usr/bin/env python3
"""
Generates synthetic, non-sensitive, redacted test fixtures for MarkItDown testing and benchmarking.
No real PII or customer documents are ever used.
"""

import os
import io
import zipfile

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")
os.makedirs(FIXTURES_DIR, exist_ok=True)

def generate_text_pdf():
    # Minimal standard PDF with text stream
    text = "GOVERNMENT OF INDIA Income Tax Department Permanent Account Number ABCDE1234F Name: Rahul Roy Father: Suresh Roy DOB: 12-05-1990 Address: Kolkata 700001"
    content = f"BT /F1 12 Tf 50 700 Td ({text}) Tj ET"
    stream_len = len(content)
    pdf = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length {stream_len} >> stream
{content}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000340 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
420
%%EOF"""
    path = os.path.join(FIXTURES_DIR, "synthetic_text.pdf")
    with open(path, "wb") as f:
        f.write(pdf.encode("latin-1"))
    print("Generated:", path)

def generate_empty_pdf():
    pdf = """%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer << /Size 4 /Root 1 0 R >>
startxref
185
%%EOF"""
    path = os.path.join(FIXTURES_DIR, "synthetic_scanned.pdf")
    with open(path, "wb") as f:
        f.write(pdf.encode("latin-1"))
    print("Generated:", path)

def generate_docx():
    path = os.path.join(FIXTURES_DIR, "synthetic_customer.docx")
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>""")
        z.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>""")
        z.writestr("word/document.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Customer Name: Anita Roy, Mobile: 9876543210, Address: 42 MG Road, City: Kolkata, State: West Bengal, PIN: 700001, Country: India</w:t></w:r></w:p>
  </w:body>
</w:document>""")
    print("Generated:", path)

def generate_xlsx():
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Customer Data"
    ws.append(["Customer Code", "Full Name", "City", "Mobile"])
    ws.append(["GCDS-1092", "Amit Kumar", "Mumbai", "9876543210"])
    path = os.path.join(FIXTURES_DIR, "synthetic_customer.xlsx")
    wb.save(path)
    print("Generated:", path)

if __name__ == "__main__":
    generate_text_pdf()
    generate_empty_pdf()
    generate_docx()
    generate_xlsx()
    print("All synthetic fixtures generated successfully.")
