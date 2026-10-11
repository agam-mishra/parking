import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'hi' | 'en'

// Every string shown in the app lives here: [Hindi, English].
const dict = {
  appName: ['पार्किंग', 'Parking'],
  phone: ['मोबाइल नंबर', 'Mobile number'],
  pin: ['6 अंकों का PIN', '6-digit PIN'],
  login: ['लॉगिन करें', 'Log in'],
  logout: ['लॉग आउट', 'Log out'],
  back: ['वापस', 'Back'],
  save: ['सेव करें', 'Save'],
  saved: ['सेव हो गया', 'Saved'],
  cancel: ['रद्द करें', 'Cancel'],
  confirm: ['पक्का करें', 'Confirm'],
  loading: ['रुकिए...', 'Please wait...'],
  search: ['खोजें', 'Search'],
  done: ['हो गया', 'Done'],
  yes: ['हाँ', 'Yes'],
  no: ['नहीं', 'No'],

  vehicleIn: ['गाड़ी अंदर', 'Vehicle In'],
  vehicleOut: ['गाड़ी बाहर', 'Vehicle Out'],
  newPass: ['मासिक / साप्ताहिक पास', 'Monthly / Weekly Pass'],
  checkVehicle: ['गाड़ी चेक करें', 'Check Vehicle'],
  myShift: ['मेरी शिफ्ट', 'My Shift'],
  khataPay: ['खाता जमा', 'Khata Payment'],

  vehicleNo: ['गाड़ी नंबर', 'Vehicle number'],
  vehicleNoHint: ['जैसे UP32AB1234', 'e.g. UP32AB1234'],
  vehicleType: ['गाड़ी का प्रकार', 'Vehicle type'],
  choosePlan: ['कितने समय के लिए?', 'For how long?'],
  day: ['दिन', 'Day'],
  night: ['रात', 'Night'],
  full_day: ['24 घंटे', '24 Hours'],
  weekly: ['साप्ताहिक', 'Weekly'],
  monthly: ['मासिक', 'Monthly'],
  pass: ['पास', 'Pass'],

  entry: ['आते समय पैसे', 'Pay at entry'],
  exit: ['जाते समय पैसे', 'Pay at exit'],
  weekly_khata: ['साप्ताहिक खाता', 'Weekly khata'],
  monthly_khata: ['मासिक खाता', 'Monthly khata'],

  takeMoney: ['पैसे लें', 'Take money'],
  noPaymentNow: ['अभी पैसे नहीं', 'No payment now'],
  payAtExit: ['जाते समय पैसे लेना है', 'Collect money at exit'],
  goesToKhata: ['खाते में जुड़ेगा', 'Will be added to khata'],
  onPass: ['पास चालू है — पैसे नहीं', 'Pass is active — no payment'],
  cash: ['नकद', 'Cash'],
  upi: ['UPI', 'UPI'],
  upiRef: ['UPI नंबर (आखिरी 4-6 अंक)', 'UPI ref (last 4–6 digits)'],
  scanToPay: ['ग्राहक से QR स्कैन कराएं', 'Ask customer to scan QR'],
  moneyReceived: ['पैसे मिल गए', 'Money received'],
  sendWhatsApp: ['WhatsApp पर रसीद भेजें', 'Send receipt on WhatsApp'],
  entryDone: ['गाड़ी अंदर दर्ज हो गई', 'Vehicle entry saved'],
  exitDone: ['गाड़ी बाहर दर्ज हो गई', 'Vehicle exit saved'],

  parkedSince: ['अंदर आई', 'Came in'],
  duration: ['कितनी देर', 'Time parked'],
  extraCharge: ['ज़्यादा समय का चार्ज', 'Overstay charge'],
  alreadyPaid: ['पहले दिए', 'Already paid'],
  total: ['कुल', 'Total'],
  dueNow: ['अभी लेने हैं', 'To collect now'],
  notInside: ['यह गाड़ी अंदर नहीं है', 'This vehicle is not inside'],
  insideNow: ['अभी अंदर', 'Inside now'],
  undoEntry: ['गलत एंट्री हटाएं', 'Remove wrong entry'],

  driverName: ['ड्राइवर का नाम', 'Driver name'],
  driverPhone: ['ड्राइवर का मोबाइल', 'Driver mobile'],
  idProof: ['पहचान पत्र', 'ID proof'],
  none: ['कोई नहीं', 'None'],
  aadhaar: ['आधार', 'Aadhaar'],
  driving_licence: ['ड्राइविंग लाइसेंस', 'Driving licence'],
  voter_id: ['वोटर ID', 'Voter ID'],
  other: ['अन्य', 'Other'],
  aadhaarLast4: ['आधार के आखिरी 4 अंक', 'Last 4 digits of Aadhaar'],
  idNumber: ['ID नंबर', 'ID number'],
  consent: ['ग्राहक ने अपनी जानकारी रखने की अनुमति दी', 'Customer agrees to store their details'],
  startDate: ['शुरू तारीख', 'Start date'],
  validTill: ['तक चालू', 'Valid till'],
  passActive: ['पास चालू', 'Pass active'],
  passExpired: ['पास खत्म', 'Pass expired'],
  passExpiring: ['पास जल्दी खत्म होगा', 'Pass ending soon'],
  noPass: ['कोई पास नहीं', 'No pass'],
  renew: ['पास बढ़ाएं', 'Renew pass'],
  newVehicle: ['नई गाड़ी — पहले कभी नहीं आई', 'New vehicle — never seen before'],
  walkIn: ['बिना रजिस्ट्रेशन', 'Not registered'],
  registerDriver: ['ड्राइवर रजिस्टर करें', 'Register driver'],
  customer: ['ग्राहक', 'Customer'],
  balance: ['बकाया', 'Balance due'],
  amount: ['रकम', 'Amount'],
  paymentType: ['भुगतान का तरीका', 'How they pay'],
  creditLimit: ['खाता सीमा (₹)', 'Khata limit (₹)'],

  shiftCash: ['नकद इकट्ठा', 'Cash collected'],
  shiftUpi: ['UPI इकट्ठा', 'UPI collected'],
  shiftCount: ['कुल भुगतान', 'Payments'],
  shiftStarted: ['शिफ्ट शुरू', 'Shift started'],
  noShift: ['अभी कोई शिफ्ट नहीं — पहला भुगतान लेते ही शुरू होगी', 'No open shift — starts with your first payment'],
  countCash: ['गल्ले में कितना नकद है? गिनकर लिखें', 'Count the cash in hand and enter it'],
  closeShift: ['शिफ्ट बंद करें', 'Close shift'],
  shiftClosed: ['शिफ्ट बंद हो गई', 'Shift closed'],
  cashShort: ['नकद कम है', 'Cash short'],
  cashExtra: ['नकद ज़्यादा है', 'Cash extra'],
  cashMatch: ['नकद सही है', 'Cash matches'],

  dashboard: ['आज का हिसाब', 'Today'],
  todayCash: ['आज नकद', 'Cash today'],
  todayUpi: ['आज UPI', 'UPI today'],
  todayEntries: ['आज की एंट्री', 'Entries today'],
  outstanding: ['कुल खाता बकाया', 'Khata outstanding'],
  expiringPasses: ['3 दिन में खत्म पास', 'Passes ending in 3 days'],
  openShifts: ['चालू शिफ्ट', 'Open shifts'],
  prices: ['रेट', 'Prices'],
  customers: ['ग्राहक / खाता', 'Customers / Khata'],
  workers: ['कर्मचारी', 'Workers'],
  payments: ['भुगतान', 'Payments'],
  settings: ['सेटिंग', 'Settings'],
  workerMode: ['गाड़ी एंट्री', 'Parking desk'],
  specialPrice: ['खास रेट', 'Special price'],
  standardPrice: ['सामान्य रेट', 'Standard price'],
  statement: ['खाता विवरण', 'Statement'],
  sendBill: ['WhatsApp पर बिल भेजें', 'Send bill on WhatsApp'],
  adjust: ['बदलाव (एडजस्ट)', 'Adjustment'],
  note: ['कारण', 'Reason'],
  addWorker: ['कर्मचारी जोड़ें', 'Add worker'],
  resetPin: ['नया PIN', 'New PIN'],
  deactivate: ['बंद करें', 'Disable'],
  activate: ['चालू करें', 'Enable'],
  name: ['नाम', 'Name'],
  role: ['भूमिका', 'Role'],
  admin: ['एडमिन', 'Admin'],
  worker: ['कर्मचारी', 'Worker'],
  tenants: ['सभी पार्किंग', 'All parking sites'],
  addTenant: ['नई पार्किंग जोड़ें', 'Add parking site'],
  siteName: ['पार्किंग का नाम', 'Site name'],
  address: ['पता', 'Address'],
  upiId: ['UPI ID', 'UPI ID'],
  adminName: ['एडमिन का नाम', 'Admin name'],
  adminPhone: ['एडमिन का मोबाइल', 'Admin mobile'],
  adminPin: ['एडमिन का PIN', 'Admin PIN'],
  open: ['खोलें', 'Open'],
  dayStarts: ['दिन शुरू', 'Day starts'],
  nightStarts: ['रात शुरू', 'Night starts'],
  graceMinutes: ['छूट समय (मिनट)', 'Grace time (minutes)'],
  walkinPay: ['बिना रजिस्ट्रेशन वाली गाड़ी कब देगी', 'When unregistered vehicles pay'],
  cancelPayment: ['भुगतान रद्द करें', 'Cancel payment'],
  cancelled: ['रद्द', 'Cancelled'],
  all: ['सभी', 'All'],
  noData: ['कुछ नहीं मिला', 'Nothing found'],
  opening: ['पिछला बकाया', 'Opening balance'],
  charges: ['चार्ज', 'Charges'],
  paid: ['जमा', 'Paid'],
  closing: ['कुल बकाया', 'Closing balance'],
  from: ['से', 'From'],
  to: ['तक', 'To'],
  vehicles: ['गाड़ियाँ', 'Vehicles'],
  addVehicle: ['गाड़ी जोड़ें', 'Add vehicle'],

  home: ['होम', 'Home'],
  nextVehicle: ['अगली गाड़ी', 'Next vehicle'],
  typeLastDigits: ['गाड़ी नंबर के आखिरी 4 अंक', 'Last 4 digits of vehicle number'],
  typeFullNumber: ['नई गाड़ी है तो पूरा नंबर लिखें', 'For a new vehicle, type the full number'],
  useNewNumber: ['यह नंबर इस्तेमाल करें (नई गाड़ी)', 'Use this number (new vehicle)'],
  scanQr: ['टोकन का QR स्कैन करें', 'Scan token QR'],
  scanToken: ['टोकन का QR डिब्बे के अंदर रखें', 'Hold the token QR inside the box'],
  cameraError: ['कैमरा नहीं खुला — नंबर लिखकर खोजें', 'Camera not available — type the number instead'],
  shareToken: ['टोकन भेजें (QR के साथ)', 'Send token (with QR)'],
  tokenFooter: ['जाते समय यह QR दिखाएं', 'Show this QR when leaving'],
  removeEntryQ: ['यह एंट्री हटानी है?', 'Remove this entry?'],
  removeEntryMsg: ['सिर्फ गलती से हुई एंट्री हटाएं।', 'Only remove an entry made by mistake.'],
  cancelPaymentQ: ['भुगतान रद्द करें — कारण लिखें', 'Cancel payment — enter reason'],
  saySavedIn: ['गाड़ी अंदर हो गई', 'Vehicle is in'],
  saySavedOut: ['गाड़ी बाहर हो गई', 'Vehicle is out'],
  saySavedPass: ['पास बन गया', 'Pass created'],
  sayKhataPaid: ['खाते में जमा हो गया', 'Khata payment saved'],

  vehiclePrices: ['गाड़ी का खास रेट', 'Vehicle prices'],
  vehiclePrice: ['इस गाड़ी का रेट', 'Price for this vehicle'],
  vehiclePriceHint: ['खाली छोड़ें तो सामान्य रेट लगेगा (हल्के अंकों में दिखा है)', 'Leave empty to use the normal price (shown in grey)'],
  vehicleNotSeen: ['यह गाड़ी अभी तक नहीं आई — पहली एंट्री के बाद रेट सेट करें', 'This vehicle has not come yet — set its price after its first entry'],
  pricesNow: ['अभी लगने वाले रेट', 'Prices that apply now'],
  refreshPrices: ['रेट फिर से देखें', 'Refresh prices'],

  // Errors raised by the database, keyed by code.
  ERR_PRICE_NOT_SET: ['इस गाड़ी का रेट सेट नहीं है — एडमिन से कहें', 'Price not set for this vehicle — ask admin'],
  ERR_ALREADY_INSIDE: ['यह गाड़ी पहले से अंदर है', 'This vehicle is already inside'],
  ERR_CREDIT_LIMIT: ['खाता सीमा पार — एडमिन से पूछें', 'Khata limit crossed — ask admin'],
  ERR_PAYMENT_METHOD_REQUIRED: ['नकद या UPI चुनें', 'Choose Cash or UPI'],
  ERR_AMOUNT_CHANGED: ['रकम बदल गई है — फिर से देखें', 'Amount changed — please check again'],
  ERR_NOT_INSIDE: ['यह गाड़ी अंदर नहीं है', 'This vehicle is not inside'],
  ERR_CUSTOMER_REQUIRED: ['पहले ड्राइवर रजिस्टर करें', 'Register the driver first'],
  ERR_PASS_OVERLAP: ['इन तारीखों में पहले से पास है', 'A pass already covers these dates'],
  ERR_ASK_ADMIN: ['यह सिर्फ एडमिन कर सकता है', 'Only admin can do this'],
  ERR_NOT_ALLOWED: ['अनुमति नहीं है', 'Not allowed'],
  ERR_BAD_REG_NO: ['गाड़ी नंबर सही लिखें', 'Enter a valid vehicle number'],
  ERR_VEHICLE_TYPE_REQUIRED: ['गाड़ी का प्रकार चुनें', 'Choose vehicle type'],
  ERR_BAD_AMOUNT: ['रकम सही लिखें', 'Enter a valid amount'],
  ERR_REASON_REQUIRED: ['कारण लिखें', 'Enter a reason'],
  ERR_ONLY_ADMIN_CAN_CHANGE_BILLING: ['भुगतान का तरीका सिर्फ एडमिन बदल सकता है', 'Only admin can change how a customer pays'],
  ERR_LOGIN: ['मोबाइल नंबर या PIN गलत है', 'Wrong mobile number or PIN'],
  ERR_NETWORK: ['इंटरनेट नहीं है — फिर से कोशिश करें', 'No internet — try again'],
  ERR_UNKNOWN: ['कुछ गड़बड़ हुई — फिर से कोशिश करें', 'Something went wrong — try again'],
} satisfies Record<string, [string, string]>

export type TKey = keyof typeof dict

const LangCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string }>(null!)

function readLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'hi'
  } catch {
    return 'hi'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  const setLang = (l: Lang) => {
    setLangState(l)
    try { localStorage.setItem('lang', l) } catch { /* private mode */ }
  }
  const t = (k: TKey) => dict[k]?.[lang === 'hi' ? 0 : 1] ?? k
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>
}

export const useT = () => useContext(LangCtx)

// Turn a Supabase/Postgres error into a translation key.
export function errKey(e: unknown): TKey {
  const msg = (e as { message?: string })?.message ?? String(e)
  const code = msg.match(/[A-Z][A-Z_]{3,}/)?.[0]
  if (code && `ERR_${code}` in dict) return `ERR_${code}` as TKey
  if (/invalid login|invalid_credentials/i.test(msg)) return 'ERR_LOGIN'
  if (/fetch|network/i.test(msg)) return 'ERR_NETWORK'
  return 'ERR_UNKNOWN'
}
