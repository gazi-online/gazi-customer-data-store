export type CustomerStatus = 'active' | 'inactive' | 'lead';
export type Gender = 'male' | 'female' | 'other';

export interface Customer {
  id: string;
  customer_code: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: Gender | null;
  father_name: string | null;
  mother_name: string | null;
  marital_status: string | null;
  spouse_name: string | null;
  
  // India specific
  aadhaar_number: string | null;
  pan_number: string | null;
  gst_number: string | null;
  voter_id_number?: string | null;
  
  // Address
  address: string;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  post_office?: string | null;
  country: string | null;
  
  photo_url: string | null;
  photo_source: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
}

export interface CustomerFormData {
  customer_code?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  date_of_birth?: string;
  gender?: Gender | "";
  father_name?: string;
  mother_name?: string;
  marital_status?: string;
  spouse_name?: string;
  
  aadhaar_number?: string;
  pan_number?: string;
  gst_number?: string;
  voter_id_number?: string;
  
  address: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  post_office?: string;
  country?: string;
  
  photo_url?: string;
  photo_source?: string;
  status: CustomerStatus;
}
