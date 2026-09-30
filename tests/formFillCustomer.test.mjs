import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/lib/extension/formFillCustomer.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { calculateAge, serializeFormFillCustomer } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

const sampleCustomer = {
  id: "0caa9764-17c2-4dc8-9e31-5f65c2d75419",
  customer_code: "CUST-0042",
  first_name: "  Reba ",
  middle_name: "  ",
  last_name: "Das ",
  date_of_birth: "1990-08-20",
  gender: "female",
  phone: "+91 98765 43210",
  email: "reba@example.test",
  voter_id_number: "ABC1234567",
  address: "12 North Road",
  city: "Kolkata",
  post_office: "G.P.O.",
  district: "Kolkata",
  state: "West Bengal",
  pincode: "700001",
  father_name: "Suman Das",
  mother_name: "Mina Das",
  spouse_name: null,
  aadhaar_number: "must never be returned",
  pan_number: "must never be returned",
  gst_number: "must never be returned",
  document_path: "must never be returned",
};

test("serializes only the voter form-fill fields and trims values", () => {
  const dto = serializeFormFillCustomer(
    sampleCustomer,
    new Date("2026-09-01T00:00:00.000Z"),
  );

  assert.deepEqual(dto, {
    customerId: "0caa9764-17c2-4dc8-9e31-5f65c2d75419",
    customerCode: "CUST-0042",
    fullName: "Reba Das",
    firstName: "Reba",
    lastName: "Das",
    dateOfBirth: "1990-08-20",
    age: 36,
    gender: "female",
    mobileNumber: "+91 98765 43210",
    email: "reba@example.test",
    epicNumber: "ABC1234567",
    address: {
      formattedAddress: "12 North Road",
      city: "Kolkata",
      postOffice: "G.P.O.",
      district: "Kolkata",
      state: "West Bengal",
      pincode: "700001",
    },
    relationships: {
      fatherName: "Suman Das",
      motherName: "Mina Das",
    },
  });
  assert.equal("aadhaarNumber" in dto, false);
  assert.equal("panNumber" in dto, false);
  assert.equal("gstNumber" in dto, false);
  assert.equal("documentPath" in dto, false);
});

test("calculates age at the birthday boundary and rejects invalid or future dates", () => {
  const beforeBirthday = new Date("2026-08-19T00:00:00.000Z");
  const onBirthday = new Date("2026-08-20T00:00:00.000Z");

  assert.equal(calculateAge("1990-08-20", beforeBirthday), 35);
  assert.equal(calculateAge("1990-08-20", onBirthday), 36);
  assert.equal(calculateAge("1990-02-30", onBirthday), undefined);
  assert.equal(calculateAge("2030-01-01", onBirthday), undefined);
});

test("omits blank optional values and unsupported gender values", () => {
  const dto = serializeFormFillCustomer({
    ...sampleCustomer,
    customer_code: " ",
    first_name: " ",
    middle_name: null,
    last_name: "",
    date_of_birth: "not-a-date",
    gender: "unspecified",
    phone: null,
    email: " ",
    voter_id_number: null,
    address: "",
    city: null,
    post_office: null,
    district: null,
    state: null,
    pincode: null,
    father_name: null,
    mother_name: null,
    spouse_name: " ",
  });

  assert.deepEqual(dto, {
    customerId: sampleCustomer.id,
    fullName: "",
    address: {},
    relationships: {},
  });
});