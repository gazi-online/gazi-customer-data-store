export interface PostOfficeInfo {
  name: string;
  branchType: string;
  deliveryStatus: string;
  block?: string;
  division?: string;
  region?: string;
  circle?: string;
  state?: string;
  district?: string;
}

export type PincodeSourceType = 'third_party_reference' | 'official_cept' | 'local_dataset';

export interface PincodeLookupResult {
  pincode: string;
  state: string;
  district: string;
  country: string;
  postOffices: PostOfficeInfo[];
  citiesOrLocalities: string[];
  source: string; // e.g. "postalpincode.in"
  sourceType: PincodeSourceType;
}

export interface PincodeResponse {
  success: boolean;
  data?: PincodeLookupResult;
  error?: string;
}

export interface IPincodeProvider {
  lookup(pincode: string): Promise<PincodeResponse>;
}
