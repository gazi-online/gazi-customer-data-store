import { ElectoralCandidate } from '../electoral-types';

export interface ConstituencySubMapping {
  postOffices?: string[];
  localityKeywords?: string[];
  candidate: ElectoralCandidate;
}

export interface PincodeElectoralMapping {
  pincode: string;
  district: string;
  state: string;
  isUnique: boolean;
  candidates: ElectoralCandidate[];
  subMappings?: ConstituencySubMapping[];
}

const SOURCE_ECI_WB = 'CEO West Bengal / Election Commission of India Delimitation Order';

/**
 * Authoritative mapping dataset for West Bengal PIN codes and constituencies.
 * Maintained per Delimitation of Parliamentary and Assembly Constituencies Order.
 */
export const WEST_BENGAL_PINCODE_MAPPINGS: PincodeElectoralMapping[] = [
  // ── Basirhat Region (North 24 Parganas) ──────────────────────────────────
  {
    pincode: '743411',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    candidates: [
      {
        assembly_constituency: 'Basirhat Uttar',
        assembly_constituency_number: '102',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'North sector of Basirhat postal delivery zone',
      },
      {
        assembly_constituency: 'Basirhat Dakshin',
        assembly_constituency_number: '124',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'South & municipality sector of Basirhat postal delivery zone',
      },
    ],
    subMappings: [
      {
        postOffices: ['Dandirhat', 'Kholapota', 'Bhebia', 'Malatipur'],
        localityKeywords: ['dandirhat', 'uttar', 'kholapota', 'bhebia', 'malatipur', 'gazi para', 'gazipara'],
        candidate: {
          assembly_constituency: 'Basirhat Uttar',
          assembly_constituency_number: '102',
          parliamentary_constituency: 'Basirhat',
          parliamentary_constituency_number: '18',
          source: SOURCE_ECI_WB,
          confidence: 'high',
          reason: 'Matched via Post Office / Locality in Basirhat Uttar',
        },
      },
      {
        postOffices: ['Basirhat College', 'Basirhat Town', 'Basirhat Court', 'Sangrampur', 'Basirhat SO'],
        localityKeywords: ['college', 'dakshin', 'municipality', 'court', 'station road', 'sangrampur', 'town'],
        candidate: {
          assembly_constituency: 'Basirhat Dakshin',
          assembly_constituency_number: '124',
          parliamentary_constituency: 'Basirhat',
          parliamentary_constituency_number: '18',
          source: SOURCE_ECI_WB,
          confidence: 'high',
          reason: 'Matched via Post Office / Locality in Basirhat Dakshin',
        },
      },
    ],
  },
  {
    pincode: '743412',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: false,
    candidates: [
      {
        assembly_constituency: 'Sandeshkhali (ST)',
        assembly_constituency_number: '123',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Sandeshkhali block jurisdiction',
      },
      {
        assembly_constituency: 'Hingalganj (SC)',
        assembly_constituency_number: '125',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Hasnabad & Hingalganj block jurisdiction',
      },
    ],
    subMappings: [
      {
        postOffices: ['Sandeshkhali', 'Bayermari', 'Bermajur', 'Durgamandap'],
        localityKeywords: ['sandeshkhali', 'bayermari', 'bermajur', 'durgamandap', 'korakati'],
        candidate: {
          assembly_constituency: 'Sandeshkhali (ST)',
          assembly_constituency_number: '123',
          parliamentary_constituency: 'Basirhat',
          parliamentary_constituency_number: '18',
          source: SOURCE_ECI_WB,
          confidence: 'high',
          reason: 'Matched via Sandeshkhali locality',
        },
      },
      {
        postOffices: ['Hasnabad', 'Hingalganj', 'Rameshwarpur', 'Chakpatli'],
        localityKeywords: ['hasnabad', 'hingalganj', 'rameshwarpur', 'chakpatli', 'patlikhanpur'],
        candidate: {
          assembly_constituency: 'Hingalganj (SC)',
          assembly_constituency_number: '125',
          parliamentary_constituency: 'Basirhat',
          parliamentary_constituency_number: '18',
          source: SOURCE_ECI_WB,
          confidence: 'high',
          reason: 'Matched via Hasnabad / Hingalganj locality',
        },
      },
    ],
  },
  {
    pincode: '743422',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Basirhat Uttar',
        assembly_constituency_number: '102',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Bhebia postal delivery area falls uniquely inside AC 102',
      },
    ],
  },
  {
    pincode: '743424',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Haroa',
        assembly_constituency_number: '121',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Haroa postal zone falls uniquely inside AC 121',
      },
    ],
  },
  {
    pincode: '743425',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Baduria',
        assembly_constituency_number: '99',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Baduria postal area falls uniquely inside AC 99',
      },
    ],
  },
  {
    pincode: '743426',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Basirhat Uttar',
        assembly_constituency_number: '102',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Kholapota postal area falls uniquely inside AC 102',
      },
    ],
  },
  {
    pincode: '743427',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Minakhan (SC)',
        assembly_constituency_number: '122',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Minakhan postal area falls uniquely inside AC 122',
      },
    ],
  },
  {
    pincode: '743429',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Sandeshkhali (ST)',
        assembly_constituency_number: '123',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Sandeshkhali postal delivery area falls uniquely inside AC 123',
      },
    ],
  },
  {
    pincode: '743435',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Hingalganj (SC)',
        assembly_constituency_number: '125',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Hingalganj postal delivery area falls uniquely inside AC 125',
      },
    ],
  },
  {
    pincode: '743456',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Basirhat Uttar',
        assembly_constituency_number: '102',
        parliamentary_constituency: 'Basirhat',
        parliamentary_constituency_number: '18',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Kashipur/Bhebia area falls uniquely inside AC 102',
      },
    ],
  },
  {
    pincode: '743423',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Deganga',
        assembly_constituency_number: '101',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Deganga postal area falls uniquely inside AC 101',
      },
    ],
  },

  // ── Barasat / New Town / Bidhannagar / North 24 Parganas ─────────────────
  {
    pincode: '700124',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Barasat',
        assembly_constituency_number: '119',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Barasat head post office falls uniquely inside AC 119',
      },
    ],
  },
  {
    pincode: '700125',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Barasat',
        assembly_constituency_number: '119',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Nabapally Barasat falls uniquely inside AC 119',
      },
    ],
  },
  {
    pincode: '700129',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Madhyamgram',
        assembly_constituency_number: '118',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Madhyamgram postal zone falls uniquely inside AC 118',
      },
    ],
  },
  {
    pincode: '700136',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Rajarhat Gopalpur',
        assembly_constituency_number: '117',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Rajarhat area falls uniquely inside AC 117',
      },
    ],
  },
  {
    pincode: '700156',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Rajarhat New Town',
        assembly_constituency_number: '115',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'New Town Action Area falls uniquely inside AC 115',
      },
    ],
  },
  {
    pincode: '700091',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Bidhannagar',
        assembly_constituency_number: '116',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Salt Lake Sector V falls uniquely inside AC 116',
      },
    ],
  },
  {
    pincode: '700064',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Bidhannagar',
        assembly_constituency_number: '116',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Salt Lake Sector I/II falls uniquely inside AC 116',
      },
    ],
  },
  {
    pincode: '743263',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Habra',
        assembly_constituency_number: '110',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Habra delivery zone falls uniquely inside AC 110',
      },
    ],
  },
  {
    pincode: '743273',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Ashoknagar',
        assembly_constituency_number: '109',
        parliamentary_constituency: 'Barasat',
        parliamentary_constituency_number: '17',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Ashoknagar zone falls uniquely inside AC 109',
      },
    ],
  },
  {
    pincode: '743235',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Bongaon Uttar (SC)',
        assembly_constituency_number: '95',
        parliamentary_constituency: 'Bangaon (SC)',
        parliamentary_constituency_number: '14',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Bongaon town falls uniquely inside AC 95',
      },
    ],
  },
  {
    pincode: '743245',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Bongaon Dakshin (SC)',
        assembly_constituency_number: '96',
        parliamentary_constituency: 'Bangaon (SC)',
        parliamentary_constituency_number: '14',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Bongaon south sector falls uniquely inside AC 96',
      },
    ],
  },

  // ── Kolkata Urban ────────────────────────────────────────────────────────
  {
    pincode: '700001',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: false,
    candidates: [
      {
        assembly_constituency: 'Chowrangee',
        assembly_constituency_number: '162',
        parliamentary_constituency: 'Kolkata Uttar',
        parliamentary_constituency_number: '24',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Central Dalhousie / BBD Bagh sector',
      },
      {
        assembly_constituency: 'Jorasanko',
        assembly_constituency_number: '165',
        parliamentary_constituency: 'Kolkata Uttar',
        parliamentary_constituency_number: '24',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Northern business & Burrabazar border sector',
      },
    ],
    subMappings: [
      {
        postOffices: ['B.B.D. Bagh', 'Dalhousie', 'Fairlie Place', 'Chowringhee'],
        localityKeywords: ['bbd bagh', 'dalhousie', 'fairlie', 'chowringhee', 'esplanade', 'gpo', 'governor', 'writers'],
        candidate: {
          assembly_constituency: 'Chowrangee',
          assembly_constituency_number: '162',
          parliamentary_constituency: 'Kolkata Uttar',
          parliamentary_constituency_number: '24',
          source: SOURCE_ECI_WB,
          confidence: 'high',
          reason: 'Matched via BBD Bagh / Dalhousie locality in Chowrangee',
        },
      },
      {
        postOffices: ['Burrabazar', 'Canning Street', 'Posta'],
        localityKeywords: ['burrabazar', 'canning', 'posta', 'jorasanko', 'clive row', 'strand road'],
        candidate: {
          assembly_constituency: 'Jorasanko',
          assembly_constituency_number: '165',
          parliamentary_constituency: 'Kolkata Uttar',
          parliamentary_constituency_number: '24',
          source: SOURCE_ECI_WB,
          confidence: 'high',
          reason: 'Matched via Burrabazar / Canning Street locality in Jorasanko',
        },
      },
    ],
  },
  {
    pincode: '700007',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Jorasanko',
        assembly_constituency_number: '165',
        parliamentary_constituency: 'Kolkata Uttar',
        parliamentary_constituency_number: '24',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Burrabazar / Jorasanko falls uniquely inside AC 165',
      },
    ],
  },
  {
    pincode: '700006',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Shyampukur',
        assembly_constituency_number: '166',
        parliamentary_constituency: 'Kolkata Uttar',
        parliamentary_constituency_number: '24',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Beadon Street falls uniquely inside AC 166',
      },
    ],
  },
  {
    pincode: '700004',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Shyampukur',
        assembly_constituency_number: '166',
        parliamentary_constituency: 'Kolkata Uttar',
        parliamentary_constituency_number: '24',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Shyambazar delivery zone falls uniquely inside AC 166',
      },
    ],
  },
  {
    pincode: '700019',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Ballygunge',
        assembly_constituency_number: '161',
        parliamentary_constituency: 'Kolkata Dakshin',
        parliamentary_constituency_number: '23',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Ballygunge area falls uniquely inside AC 161',
      },
    ],
  },
  {
    pincode: '700020',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Bhabanipur',
        assembly_constituency_number: '159',
        parliamentary_constituency: 'Kolkata Dakshin',
        parliamentary_constituency_number: '23',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'AJC Bose Road / Bhowanipore falls uniquely inside AC 159',
      },
    ],
  },
  {
    pincode: '700025',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Bhabanipur',
        assembly_constituency_number: '159',
        parliamentary_constituency: 'Kolkata Dakshin',
        parliamentary_constituency_number: '23',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Bhowanipore delivery zone falls uniquely inside AC 159',
      },
    ],
  },
  {
    pincode: '700029',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Rashbehari',
        assembly_constituency_number: '160',
        parliamentary_constituency: 'Kolkata Dakshin',
        parliamentary_constituency_number: '23',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Sarat Bose Road / Southern Avenue falls uniquely inside AC 160',
      },
    ],
  },
  {
    pincode: '700034',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Behala Paschim',
        assembly_constituency_number: '154',
        parliamentary_constituency: 'Kolkata Dakshin',
        parliamentary_constituency_number: '23',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Behala Chowrasta / west sector falls uniquely inside AC 154',
      },
    ],
  },
  {
    pincode: '700038',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Behala Purba',
        assembly_constituency_number: '153',
        parliamentary_constituency: 'Kolkata Dakshin',
        parliamentary_constituency_number: '23',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Behala East sector falls uniquely inside AC 153',
      },
    ],
  },
  {
    pincode: '700042',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Kasba',
        assembly_constituency_number: '149',
        parliamentary_constituency: 'Kolkata Dakshin',
        parliamentary_constituency_number: '23',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Kasba delivery zone falls uniquely inside AC 149',
      },
    ],
  },
  {
    pincode: '700043',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Kolkata Port',
        assembly_constituency_number: '158',
        parliamentary_constituency: 'Kolkata Dakshin',
        parliamentary_constituency_number: '23',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Garden Reach / Port area falls uniquely inside AC 158',
      },
    ],
  },
  {
    pincode: '700032',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Jadavpur',
        assembly_constituency_number: '150',
        parliamentary_constituency: 'Jadavpur',
        parliamentary_constituency_number: '22',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Jadavpur delivery zone falls uniquely inside AC 150',
      },
    ],
  },
  {
    pincode: '700033',
    district: 'Kolkata',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Tollyganj',
        assembly_constituency_number: '152',
        parliamentary_constituency: 'Jadavpur',
        parliamentary_constituency_number: '22',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Tollygunge delivery zone falls uniquely inside AC 152',
      },
    ],
  },

  // ── Howrah & Hooghly ─────────────────────────────────────────────────────
  {
    pincode: '711101',
    district: 'Howrah',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Howrah Madhya',
        assembly_constituency_number: '171',
        parliamentary_constituency: 'Howrah',
        parliamentary_constituency_number: '25',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Howrah Head Post Office falls uniquely inside AC 171',
      },
    ],
  },
  {
    pincode: '711102',
    district: 'Howrah',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Shibpur',
        assembly_constituency_number: '172',
        parliamentary_constituency: 'Howrah',
        parliamentary_constituency_number: '25',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Shibpur delivery area falls uniquely inside AC 172',
      },
    ],
  },
  {
    pincode: '712201',
    district: 'Hooghly',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Sreerampur',
        assembly_constituency_number: '186',
        parliamentary_constituency: 'Sreerampur',
        parliamentary_constituency_number: '27',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Serampore town falls uniquely inside AC 186',
      },
    ],
  },
  {
    pincode: '741201',
    district: 'Nadia',
    state: 'West Bengal',
    isUnique: true,
    candidates: [
      {
        assembly_constituency: 'Ranaghat Dakshin (SC)',
        assembly_constituency_number: '90',
        parliamentary_constituency: 'Ranaghat (SC)',
        parliamentary_constituency_number: '13',
        source: SOURCE_ECI_WB,
        confidence: 'high',
        reason: 'Ranaghat delivery area falls uniquely inside AC 90',
      },
    ],
  },
];
