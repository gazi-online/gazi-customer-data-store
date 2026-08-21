"use server";

import { IndiaPincodeProvider } from './IndiaPincodeProvider';
import { PincodeResponse } from './address-types';

export async function lookupPincode(pincode: string): Promise<PincodeResponse> {
  return IndiaPincodeProvider.lookup(pincode);
}
