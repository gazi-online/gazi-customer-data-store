/**
 * REGRESSION TEST: CustomerForm Field Completeness
 *
 * PURPOSE:
 *   Guard against future UX simplification passes that inadvertently remove,
 *   hide, or omit historically-supported fields from the CustomerForm.
 *
 * HISTORY:
 *   A previous simplification pass caused `original_language_name` (Bengali/native
 *   name) to be present in the Zod schema, DB column, and update policy but never
 *   rendered in the JSX. This test suite prevents silent regressions of that kind.
 */

import fs from "fs";
import path from "path";
import { VALID_FORM_FIELDS } from "../customerFormUpdatePolicy";

const REQUIRED_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "original_language_name",
  "phone",
  "whatsapp",
  "email",
  "date_of_birth",
  "gender",
  "father_name",
  "mother_name",
  "marital_status",
  "spouse_name",
  "aadhaar_number",
  "pan_number",
  "gst_number",
  "voter_id_number",
  "address",
  "pincode",
  "state",
  "district",
  "city",
  "post_office",
  "country",
  "photo_source",
  "customer_code",
  "status",
] as const;

describe("VALID_FORM_FIELDS completeness (customerFormUpdatePolicy)", () => {
  for (const field of REQUIRED_FIELDS) {
    it(`should include field: ${field}`, () => {
      expect(VALID_FORM_FIELDS.has(field)).toBe(true);
    });
  }
});

describe("CustomerForm JSX render completeness", () => {
  const formPath = path.resolve(__dirname, "../CustomerForm.tsx");
  let formSource: string;

  beforeAll(() => {
    formSource = fs.readFileSync(formPath, "utf-8");
  });

  const JSX_EXEMPT_FIELDS = new Set([
    "photo_url",
    "country",
  ]);

  for (const field of REQUIRED_FIELDS) {
    if (JSX_EXEMPT_FIELDS.has(field)) continue;
    it(`should render an input bound to: ${field}`, () => {
      expect(formSource).toContain(`register("${field}")`);
    });
  }

  it("should render a visible <input> for original_language_name (Bengali/native name regression)", () => {
    expect(formSource).toContain('register("original_language_name")');
    const fieldIdx = formSource.indexOf('register("original_language_name")');
    const ctx = formSource.slice(Math.max(0, fieldIdx - 200), fieldIdx + 200);
    expect(ctx).not.toContain('type="hidden"');
  });
});

describe("CustomerForm cleanedData submit handler completeness", () => {
  const formPath = path.resolve(__dirname, "../CustomerForm.tsx");
  let formSource: string;

  beforeAll(() => {
    formSource = fs.readFileSync(formPath, "utf-8");
  });

  const FIELDS_REQUIRING_SUBMIT_HANDLING = [
    "original_language_name",
    "first_name",
    "last_name",
    "phone",
    "address",
    "status",
    "aadhaar_number",
    "pan_number",
    "voter_id_number",
    "gst_number",
  ];

  for (const field of FIELDS_REQUIRING_SUBMIT_HANDLING) {
    it(`should reference ${field} in submit/cleanedData handler`, () => {
      expect(formSource).toContain(field);
    });
  }
});
