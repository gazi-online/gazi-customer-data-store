export type FormFillGender = "male" | "female" | "other";

export interface FormFillCustomerDTO {
  customerId: string;
  customerCode?: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  age?: number;
  gender?: FormFillGender;
  mobileNumber?: string;
  email?: string;
  epicNumber?: string;
  address: {
    formattedAddress?: string;
    city?: string;
    postOffice?: string;
    district?: string;
    state?: string;
    pincode?: string;
  };
  relationships: {
    fatherName?: string;
    motherName?: string;
    spouseName?: string;
  };
}

export interface FormFillCustomerRecord {
  id: string;
  customer_code: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  voter_id_number: string | null;
  address: string | null;
  city: string | null;
  post_office: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeGender(value: string | null): FormFillGender | undefined {
  if (value === "male" || value === "female" || value === "other") return value;
  return undefined;
}

function validIsoDate(value: string | null | undefined): string | undefined {
  const normalized = nonEmpty(value);
  const match = normalized?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!normalized || !match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return normalized;
}

export function calculateAge(
  dateOfBirth: string | null | undefined,
  asOf = new Date(),
): number | undefined {
  const normalized = validIsoDate(dateOfBirth);
  if (!normalized) return undefined;
  const [year, month, day] = normalized.split("-").map(Number);
  const birthDate = new Date(Date.UTC(year, month - 1, day));

  const currentDate = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  );
  if (birthDate.getTime() > currentDate.getTime()) return undefined;

  let age = currentDate.getUTCFullYear() - year;
  if (
    currentDate.getUTCMonth() < month - 1 ||
    (currentDate.getUTCMonth() === month - 1 && currentDate.getUTCDate() < day)
  ) {
    age -= 1;
  }
  return age;
}

/**
 * Explicit allow-list for the V1 voter form workflow. Do not return database
 * records directly from the extension endpoint.
 */
export function serializeFormFillCustomer(
  record: FormFillCustomerRecord,
  asOf = new Date(),
): FormFillCustomerDTO {
  const firstName = nonEmpty(record.first_name);
  const middleName = nonEmpty(record.middle_name);
  const lastName = nonEmpty(record.last_name);
  const customerCode = nonEmpty(record.customer_code);
  const dateOfBirth = validIsoDate(record.date_of_birth);
  const age = calculateAge(dateOfBirth, asOf);
  const gender = normalizeGender(record.gender);
  const mobileNumber = nonEmpty(record.phone);
  const email = nonEmpty(record.email);
  const epicNumber = nonEmpty(record.voter_id_number);
  const formattedAddress = nonEmpty(record.address);
  const city = nonEmpty(record.city);
  const postOffice = nonEmpty(record.post_office);
  const district = nonEmpty(record.district);
  const state = nonEmpty(record.state);
  const pincode = nonEmpty(record.pincode);
  const fatherName = nonEmpty(record.father_name);
  const motherName = nonEmpty(record.mother_name);
  const spouseName = nonEmpty(record.spouse_name);

  return {
    customerId: record.id,
    ...(customerCode ? { customerCode } : {}),
    fullName: [firstName, middleName, lastName].filter(Boolean).join(" "),
    ...(firstName ? { firstName } : {}),
    ...(lastName ? { lastName } : {}),
    ...(dateOfBirth ? { dateOfBirth } : {}),
    ...(age !== undefined ? { age } : {}),
    ...(gender ? { gender } : {}),
    ...(mobileNumber ? { mobileNumber } : {}),
    ...(email ? { email } : {}),
    ...(epicNumber ? { epicNumber } : {}),
    address: {
      ...(formattedAddress ? { formattedAddress } : {}),
      ...(city ? { city } : {}),
      ...(postOffice ? { postOffice } : {}),
      ...(district ? { district } : {}),
      ...(state ? { state } : {}),
      ...(pincode ? { pincode } : {}),
    },
    relationships: {
      ...(fatherName ? { fatherName } : {}),
      ...(motherName ? { motherName } : {}),
      ...(spouseName ? { spouseName } : {}),
    },
  };
}