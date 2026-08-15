import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const outputDir = path.join(process.cwd(), 'benchmark-docs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

interface DummyData {
  id: string;
  title: string;
  nameEng: string;
  nameBen: string;
  fatherHusband: string;
  dob: string;
  gender: string;
  number: string;
  addressEng: string;
  addressBen: string;
  district: string;
  state: string;
  pincode: string;
}

const dummyDocs: DummyData[] = [
  {
    id: 'doc_1',
    title: 'GOVERNMENT OF INDIA / ভারত সরকার',
    nameEng: 'Rahat Ali',
    nameBen: 'রাহাত আলী',
    fatherHusband: 'Father: Abdul Hossain',
    dob: '01/01/1990',
    gender: 'Male / পুরুষ',
    number: '9999 8888 1111',
    addressEng: 'Vill- Nutan Gram, PO- Raninagar, District- Murshidabad, PIN- 742308',
    addressBen: 'গ্রাম- নতুন গ্রাম, পো- রানি নগর, জেলা- মুর্শিদাবাদ, পিন- 742308',
    district: 'Murshidabad',
    state: 'West Bengal',
    pincode: '742308'
  },
  {
    id: 'doc_2',
    title: 'IDENTITY CARD / পরিচয়পত্র',
    nameEng: 'Dipika Roy',
    nameBen: 'দীপিকা রায়',
    fatherHusband: 'Husband: Subhash Roy',
    dob: '15/05/1988',
    gender: 'Female / মহিলা',
    number: '9999 8888 2222',
    addressEng: 'House 42, Station Road, Krishnanagar, District- Nadia, PIN- 741101',
    addressBen: 'বাসা ৪২, স্টেশন রোড, কৃষ্ণনগর, জেলা- নদীয়া, পিন- ৭৪১১০১',
    district: 'Nadia',
    state: 'West Bengal',
    pincode: '741101'
  },
  {
    id: 'doc_3',
    title: 'ELECTION COMMISSION IDENTITY / নির্বাচন কমিশন',
    nameEng: 'Sanjoy Ghosh',
    nameBen: 'সঞ্জয় ঘোষ',
    fatherHusband: 'Father: Tarun Ghosh',
    dob: '10/12/1995',
    gender: 'Male / পুরুষ',
    number: 'WB/04/123/456789',
    addressEng: 'Flat 3B, Green View Apt, Chinsurah, District- Hooghly, PIN- 712101',
    addressBen: 'ফ্ল্যাট ৩বি, গ্রিন ভিউ অ্যাপার্টমেন্ট, চুঁচুড়া, জেলা- হুগলী, পিন- ৭১২১০১',
    district: 'Hooghly',
    state: 'West Bengal',
    pincode: '712101'
  },
  {
    id: 'doc_4',
    title: 'NATIONAL ID / राष्ट्रीय पहचान पत्र',
    nameEng: 'Rajesh Kumar',
    nameBen: 'राजेश कुमार',
    fatherHusband: 'Father: Ramesh Kumar',
    dob: '20/08/1992',
    gender: 'Male / पुरुष',
    number: '9999 8888 4444',
    addressEng: '12 Gandhi Path, Kankarbagh, District- Patna, State- Bihar, PIN- 800020',
    addressBen: '१२ गांधी पथ, कंकड़बाग, जिला- पटना, राज्य- बिहार, पिन- ८०००२०',
    district: 'Patna',
    state: 'Bihar',
    pincode: '800020'
  },
  {
    id: 'doc_5',
    title: 'TAX IDENTIFICATION CARD / আয়কর পরিচয়পত্র',
    nameEng: 'Ananya Das',
    nameBen: 'অনন্যা দাস',
    fatherHusband: 'Father: Bikash Das',
    dob: '05/03/1997',
    gender: 'Female / মহিলা',
    number: 'ABCDE1234F',
    addressEng: 'PO- Barrackpore, District- North 24 Parganas, State- West Bengal, PIN- 700120',
    addressBen: 'পো- ব্যারাকপুর, জেলা- উত্তর ২৪ পরগনা, রাজ্য- পশ্চিমবঙ্গ, পিন- ৭০০১২০',
    district: 'North 24 Parganas',
    state: 'West Bengal',
    pincode: '700120'
  }
];

function createSvg(data: DummyData): string {
  return `<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#F8FAFC" rx="16" stroke="#CBD5E1" stroke-width="4"/>
    <rect x="20" y="20" width="760" height="70" fill="#1E3A8A" rx="8"/>
    <text x="400" y="60" font-family="sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${data.title}</text>
    
    <!-- Photo Box -->
    <rect x="50" y="110" width="130" height="160" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2" rx="4"/>
    <text x="115" y="195" font-family="sans-serif" font-size="14" fill="#64748B" text-anchor="middle">[PHOTO]</text>
    
    <!-- Details Column 1 -->
    <text x="210" y="135" font-family="sans-serif" font-size="20" font-weight="bold" fill="#0F172A">Name: ${data.nameEng}</text>
    <text x="210" y="165" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1D4ED8">নাম: ${data.nameBen}</text>
    
    <text x="210" y="200" font-family="sans-serif" font-size="16" fill="#334155">${data.fatherHusband}</text>
    <text x="210" y="230" font-family="sans-serif" font-size="16" fill="#334155">DOB: ${data.dob}  |  Gender: ${data.gender}</text>
    <text x="210" y="260" font-family="sans-serif" font-size="18" font-weight="bold" fill="#0F172A">ID No: ${data.number}</text>

    <!-- Separator -->
    <line x1="40" y1="290" x2="760" y2="290" stroke="#CBD5E1" stroke-width="2"/>

    <!-- Address Section -->
    <text x="50" y="325" font-family="sans-serif" font-size="16" font-weight="bold" fill="#0F172A">Address (Eng):</text>
    <text x="50" y="355" font-family="sans-serif" font-size="15" fill="#334155">${data.addressEng}</text>
    
    <text x="50" y="395" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1D4ED8">ঠিকানা (বাংলা):</text>
    <text x="50" y="425" font-family="sans-serif" font-size="15" fill="#334155">${data.addressBen}</text>

    <text x="50" y="465" font-family="sans-serif" font-size="15" font-weight="bold" fill="#0F172A">District: ${data.district}  |  State: ${data.state}  |  PIN: ${data.pincode}</text>
  </svg>`;
}

async function generateAll() {
  console.log('Creating 5 non-sensitive dummy test documents...');
  for (const doc of dummyDocs) {
    const svgStr = createSvg(doc);
    const filePath = path.join(outputDir, `${doc.id}.png`);
    await sharp(Buffer.from(svgStr)).png().toFile(filePath);
    console.log(`Generated ${filePath}`);
  }
  console.log('All 5 dummy documents created successfully.');
}

generateAll();
