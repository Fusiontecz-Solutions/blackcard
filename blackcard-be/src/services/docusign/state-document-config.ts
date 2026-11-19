/**
 * State disclosure PDF tab coordinates for DocuSign merged envelopes.
 *
 * `tabLabel` values match CRM prefill field ids from
 * `in-house-crm-fe/src/components/application/contractdata/Daily_*.ts` and
 * `Weekly_California.ts` (snake_case), NOT legacy third-party platform names
 * (`purchasePrice`, `amountFinanced`, `paymentTerms`, etc.).
 *
 * Config keys: `${frequency}${StateName}` — e.g. `dailyFlorida`, `weeklyCalifornia`.
 */

type StateDocumentTabParty = 'primary' | 'secondary';

export interface StateDocumentFieldConfig {
  documentId: string;
  pageNumber: string;
  signHere: {
    x: string;
    y: string;
    pageNumber?: string;
    signerParty?: StateDocumentTabParty;
  }[];
  dateTabs: {
    x: string;
    y: string;
    pageNumber?: string;
    tabLabel?: string;
    signerParty?: StateDocumentTabParty;
  }[];
  textTabs: {
    tabLabel: string;
    x: string;
    y: string;
    pageNumber?: string;
    width?: string;
    height?: string;
    /** When true, tab is not required and may be omitted when empty. */
    optional?: boolean;
    /** When true, signer cannot edit (CRM prefill only). */
    lockedForSigner?: boolean;
  }[];
  initialHereTabs?: { x: string; y: string; pageNumber?: string }[];
}

/** Florida disclosure page-1 coordinates — daily layout. */
const FLORIDA_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '149' },
  { tabLabel: 'total_amount_business_fund', x: '426', y: '102' },
  { tabLabel: 'funder_name', x: '209', y: '186' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '153' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '429', y: '190' },
  { tabLabel: 'total_dollar_cost', x: '429', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '430', y: '274' },
  { tabLabel: 'percent_of_business_income', x: '417', y: '326' },
  { tabLabel: 'client_name', x: '468', y: '326' },
  { tabLabel: 'client_name', x: '419', y: '356' },
  { tabLabel: 'total_dollar_cost', x: '477', y: '435' },
];

/** Florida disclosure page-1 coordinates — weekly layout. */
const FLORIDA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '149' },
  { tabLabel: 'total_amount_business_fund', x: '426', y: '102' },
  { tabLabel: 'funder_name', x: '209', y: '186' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '153' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '429', y: '190' },
  { tabLabel: 'total_dollar_cost', x: '429', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '430', y: '274' },
  { tabLabel: 'percent_of_business_income', x: '417', y: '326' },
  { tabLabel: 'client_name', x: '468', y: '326' },
  { tabLabel: 'client_name', x: '419', y: '356' },
  { tabLabel: 'total_dollar_cost', x: '478', y: '461' },
];

/** Missouri disclosure page-1 coordinates. */
const MISSOURI_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '149' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '102' },
  { tabLabel: 'funder_name', x: '209', y: '186' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '153' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '436', y: '190' },
  { tabLabel: 'total_dollar_cost', x: '436', y: '240' },
  { tabLabel: 'estimated_payment_amount', x: '434', y: '288' },
  { tabLabel: 'percent_of_business_income', x: '416', y: '355' },
  { tabLabel: 'client_name', x: '473', y: '355' },
  { tabLabel: 'client_name', x: '420', y: '394' },
  { tabLabel: 'total_dollar_cost', x: '479', y: '489' },
];

const MISSOURI_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '88', y: '604' },
    { x: '426', y: '603', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '83', y: '679', tabLabel: 'Signature_date' },
    { x: '422', y: '679', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

/** Georgia disclosure page-1 coordinates — daily layout. */
const GEORGIA_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '149' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '102' },
  { tabLabel: 'funder_name', x: '208', y: '202' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '153' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '436', y: '206' },
  { tabLabel: 'total_dollar_cost', x: '437', y: '256' },
  { tabLabel: 'estimated_payment_amount', x: '434', y: '288' },
  { tabLabel: 'percent_of_business_income', x: '415', y: '340' },
  { tabLabel: 'client_name', x: '474', y: '341' },
  { tabLabel: 'client_name', x: '422', y: '384' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '476' },
];

/** Georgia disclosure page-1 coordinates — weekly layout. */
const GEORGIA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '100' },
  { tabLabel: 'client_name', x: '248', y: '149' },
  { tabLabel: 'total_amount_business_fund', x: '436', y: '102' },
  { tabLabel: 'funder_name', x: '210', y: '187' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '436', y: '153' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '438', y: '186' },
  { tabLabel: 'total_dollar_cost', x: '433', y: '238' },
  { tabLabel: 'estimated_payment_amount', x: '430', y: '274' },
  { tabLabel: 'percent_of_business_income', x: '419', y: '327' },
  { tabLabel: 'client_name', x: '463', y: '328' },
  { tabLabel: 'client_name', x: '419', y: '356' },
  { tabLabel: 'total_dollar_cost', x: '477', y: '462' },
];

const GEORGIA_DAILY_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '91', y: '589' },
    { x: '430', y: '589', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '86', y: '665', tabLabel: 'Signature_date' },
    { x: '426', y: '665', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

const GEORGIA_WEEKLY_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '91', y: '577' },
    { x: '430', y: '589', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '88', y: '653', tabLabel: 'Signature_date' },
    { x: '426', y: '665', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

/** Utah disclosure page-2 owner signatures and agreement dates (daily + weekly). */
const UTAH_DISCLOSURE_PAGE2_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '92', y: '102', pageNumber: '2' },
    { x: '431', y: '101', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '90', y: '175', pageNumber: '2', tabLabel: 'Signature_date' },
    {
      x: '431',
      y: '175',
      pageNumber: '2',
      tabLabel: 'Signature_date',
      signerParty: 'secondary',
    },
  ],
};

/** Utah disclosure page-1 amount / variable-payment coordinates (daily + weekly). */
const UTAH_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'purchase_amount', x: '187', y: '109' },
  { tabLabel: 'net_to_merchant', x: '191', y: '144' },
  { tabLabel: 'purchase_price', x: '190', y: '179' },
  { tabLabel: 'finance_charge', x: '190', y: '213' },
  { tabLabel: 'remittance', x: '189', y: '344' },
  { tabLabel: 'monthly_income', x: '227', y: '529' },
  { tabLabel: 'appendix_underwriting_fees', x: '190', y: '461' },
  // Payment-terms % of daily revenue (not cadence). Keep off bare `frequency`
  // so Contract / OfferDecision frequency cannot be polluted with "0.00%".
  { tabLabel: 'payment_terms_percent', x: '174', y: '514' },
  { tabLabel: 'payment_exceed_percent', x: '403', y: '559' },
];

/** Kansas disclosure page-1 coordinates — daily layout. */
const KANSAS_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '98' },
  { tabLabel: 'client_name', x: '248', y: '149' },
  { tabLabel: 'funder_name', x: '162', y: '199' },
  { tabLabel: 'total_amount_of_fund_provided', x: '434', y: '103' },
  { tabLabel: 'total_amount_fund_disbursed', x: '435', y: '153' },
  { tabLabel: 'total_of_payments', x: '437', y: '204' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '436', y: '243' },
  { tabLabel: 'estimated_payment', x: '437', y: '277' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '482', y: '329' },
];

/** Kansas disclosure page-1 coordinates — weekly layout. */
const KANSAS_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '245', y: '98' },
  { tabLabel: 'client_name', x: '248', y: '149' },
  { tabLabel: 'funder_name', x: '162', y: '199' },
  { tabLabel: 'total_amount_of_fund_provided', x: '434', y: '103' },
  { tabLabel: 'total_amount_fund_disbursed', x: '433', y: '136' },
  { tabLabel: 'total_of_payments', x: '434', y: '172' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '432', y: '211' },
  { tabLabel: 'estimated_payment', x: '431', y: '247' },
  { tabLabel: 'total_dollar_cost_of_frinancing', x: '475', y: '300' },
];

const KANSAS_DAILY_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '91', y: '442' },
    { x: '429', y: '442', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '91', y: '518', tabLabel: 'Signature_date' },
    { x: '428', y: '517', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

const KANSAS_WEEKLY_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '93', y: '414' },
    { x: '430', y: '416', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '88', y: '493', tabLabel: 'Signature_date' },
    { x: '430', y: '490', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

/** Virginia disclosure page-1 coordinates (daily + weekly). */
const VIRGINIA_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'disclosure_name', x: '450', y: '69' },
  { tabLabel: 'recipient_address', x: '365', y: '108' },
  { tabLabel: 'funder_name', x: '424', y: '126' },
  { tabLabel: 'funder_address', x: '346', y: '164' },
  { tabLabel: 'funder_phone', x: '466', y: '189' },
  { tabLabel: 'funder_email', x: '344', y: '229' },
  { tabLabel: 'total_amount_sales_based_financing', x: '267', y: '46' },
  { tabLabel: 'fees_deducted', x: '268', y: '89' },
  { tabLabel: 'disbursement_amount', x: '267', y: '127' },
  { tabLabel: 'finance_charge', x: '269', y: '166' },
  { tabLabel: 'total_repayment_amount', x: '269', y: '188' },
  { tabLabel: 'estimated_number_of_payement', x: '264', y: '224' },
];

const VIRGINIA_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '167', y: '719' },
    { x: '420', y: '720', signerParty: 'secondary' },
    { x: '150', y: '711', pageNumber: '2' },
    { x: '438', y: '712', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [{ x: '443', y: '45', tabLabel: 'agreement_date' }],
};

const VIRGINIA_PAGE2_HEADER_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name2', x: '152', y: '43', pageNumber: '2' },
  { tabLabel: 'recipient_address1', x: '150', y: '63', pageNumber: '2', height: '36' },
  { tabLabel: 'disclosure_date2', x: '416', y: '44', pageNumber: '2' },
];

const VIRGINIA_DAILY_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  ...VIRGINIA_PAGE2_HEADER_TEXT_TABS,
];

const VIRGINIA_WEEKLY_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  ...VIRGINIA_PAGE2_HEADER_TEXT_TABS,
];

/** Connecticut disclosure page 1 — daily layout. */
const CONNECTICUT_DAILY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name', x: '450', y: '69' },
  { tabLabel: 'recipient_address', x: '345', y: '105' },
  { tabLabel: 'funder_name', x: '424', y: '126' },
  { tabLabel: 'funder_address', x: '346', y: '164' },
  { tabLabel: 'funder_phone', x: '466', y: '189' },
  { tabLabel: 'funder_email', x: '344', y: '229' },
  { tabLabel: 'total_amount_commercial_financing', x: '267', y: '46' },
  { tabLabel: 'deducted_at_disbursement', x: '267', y: '78' },
  { tabLabel: 'total_commerical_financing', x: '267', y: '127' },
  { tabLabel: 'finance_charge', x: '269', y: '166' },
  { tabLabel: 'total_repayment_amount', x: '269', y: '188' },
  { tabLabel: 'estimated_time_periodic_paymement', x: '264', y: '224' },
  { tabLabel: 'disclosure_broker_fee', x: '393', y: '660' },
];

/** Connecticut disclosure page 1 — weekly layout (recipient address lower on page). */
const CONNECTICUT_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name', x: '450', y: '69' },
  { tabLabel: 'recipient_address', x: '345', y: '118' },
  { tabLabel: 'funder_name', x: '424', y: '126' },
  { tabLabel: 'funder_address', x: '346', y: '164' },
  { tabLabel: 'funder_phone', x: '466', y: '189' },
  { tabLabel: 'funder_email', x: '344', y: '229' },
  { tabLabel: 'total_amount_commercial_financing', x: '267', y: '46' },
  { tabLabel: 'deducted_at_disbursement', x: '267', y: '78' },
  { tabLabel: 'total_commerical_financing', x: '267', y: '127' },
  { tabLabel: 'finance_charge', x: '269', y: '166' },
  { tabLabel: 'total_repayment_amount', x: '269', y: '188' },
  { tabLabel: 'estimated_time_periodic_paymement', x: '264', y: '224' },
  { tabLabel: 'disclosure_broker_fee', x: '393', y: '660' },
];

const CONNECTICUT_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'recipient_name2', x: '152', y: '43', pageNumber: '2' },
  { tabLabel: 'recipient_address2', x: '150', y: '63', pageNumber: '2' },
  { tabLabel: 'disclosure_date2', x: '429', y: '40', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '431', y: '59', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '52', y: '176', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '280', y: '245', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '391', y: '272', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '328', y: '353', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '503', y: '337', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '341', y: '365', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '269', y: '378', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '98', y: '392', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '276', y: '487', pageNumber: '2' },
  {
    tabLabel: 'connecticut_review_field_1',
    x: '284',
    y: '527',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_2',
    x: '282',
    y: '555',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_3',
    x: '280',
    y: '599',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'connecticut_review_field_4',
    x: '275',
    y: '630',
    pageNumber: '2',
    width: '100',
    optional: true,
    lockedForSigner: true,
  },
];

const CONNECTICUT_DISCLOSURE_SIGN_INITIAL_AND_DATES: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs' | 'initialHereTabs'
> = {
  initialHereTabs: [{ x: '215', y: '722' }],
  dateTabs: [
    { x: '443', y: '45', tabLabel: 'disclosure_date' },
    { x: '475', y: '746', tabLabel: 'signature_date' },
    { x: '82', y: '39', pageNumber: '3', tabLabel: 'signature1_date' },
    {
      x: '81',
      y: '71',
      pageNumber: '3',
      tabLabel: 'signature2_date',
      signerParty: 'secondary',
    },
  ],
  signHere: [
    { x: '165', y: '23', pageNumber: '3' },
    { x: '250', y: '38', pageNumber: '3', signerParty: 'secondary' },
  ],
};

/** California disclosure sign/date positions (daily + weekly share page 2 layout). */
const CALIFORNIA_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '92', y: '260', pageNumber: '2' },
    { x: '429', y: '259', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '90', y: '336', pageNumber: '2', tabLabel: 'signature_date' },
    {
      x: '434',
      y: '335',
      pageNumber: '2',
      tabLabel: 'signature_date',
      signerParty: 'secondary',
    },
  ],
};

/** California disclosure coordinates — daily layout. */
const CALIFORNIA_DAILY_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '183', y: '99' },
  { tabLabel: 'funding_provided', x: '345', y: '139' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '236' },
  { tabLabel: 'avarage_monthly_income', x: '330', y: '316' },
  /** Merchant business legal name (not owner / client person name). */
  { tabLabel: 'disclosure_merchant_name', x: '383', y: '301' },
  { tabLabel: 'funder_name', x: '433', y: '376' },
  { tabLabel: 'finance_charge', x: '182', y: '421' },
  { tabLabel: 'payment_total', x: '184', y: '441' },
  { tabLabel: 'estimated_monthly_cost', x: '182', y: '477' },
  { tabLabel: 'funder_name', x: '348', y: '489' },
  { tabLabel: 'estimated_payment', x: '182', y: '538' },
  { tabLabel: 'funder_name', x: '174', y: '555' },
  { tabLabel: 'payement_exceeded_percent', x: '426', y: '620' },
  { tabLabel: 'client_name', x: '180', y: '635' },
  { tabLabel: 'monthly_income', x: '360', y: '648' },
  { tabLabel: 'payement_exceeded_percent', x: '405', y: '677' },
  { tabLabel: 'estimated_term', x: '198', y: '69', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '361', y: '82', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '454', y: '110', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '355', y: '159', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '446', y: '88', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '446',
    y: '109',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '446',
    y: '142',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '448', y: '164', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '448', y: '183', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '447', y: '206', pageNumber: '3' },
];

/** California weekly disclosure — distinct page 1 / page 3 x positions from daily. */
const CALIFORNIA_WEEKLY_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '183', y: '99' },
  { tabLabel: 'funding_provided', x: '345', y: '139' },
  { tabLabel: 'funder_name', x: '415', y: '96' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '236' },
  { tabLabel: 'avarage_monthly_income', x: '330', y: '316' },
  /** Merchant business legal name (not owner / client person name). */
  { tabLabel: 'disclosure_merchant_name', x: '383', y: '301' },
  { tabLabel: 'funder_name', x: '433', y: '376' },
  { tabLabel: 'finance_charge', x: '183', y: '408' },
  { tabLabel: 'payment_total', x: '183', y: '429' },
  { tabLabel: 'estimated_monthly_cost', x: '184', y: '462' },
  { tabLabel: 'funder_name', x: '349', y: '476' },
  { tabLabel: 'estimated_payment', x: '183', y: '525' },
  { tabLabel: 'funder_name', x: '240', y: '541' },
  { tabLabel: 'payement_exceeded_percent', x: '425', y: '605' },
  { tabLabel: 'client_name', x: '180', y: '620' },
  { tabLabel: 'monthly_income', x: '361', y: '633' },
  { tabLabel: 'payement_exceeded_percent', x: '405', y: '664' },
  { tabLabel: 'estimated_term', x: '198', y: '69', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '361', y: '82', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '454', y: '110', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '355', y: '159', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '434', y: '88', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '434',
    y: '109',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '434',
    y: '142',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '434', y: '164', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '434', y: '183', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '434', y: '206', pageNumber: '3' },
];

/** New York disclosure — California base layout with NY-specific tab positions (daily + weekly). */
const NEW_YORK_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '93', y: '483', pageNumber: '2' },
    { x: '429', y: '483', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '87', y: '560', pageNumber: '2', tabLabel: 'signature_date' },
    {
      x: '426',
      y: '559',
      pageNumber: '2',
      tabLabel: 'signature_date',
      signerParty: 'secondary',
    },
  ],
};

const NEW_YORK_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'funding_provided', x: '183', y: '99' },
  { tabLabel: 'funding_provided', x: '345', y: '139' },
  { tabLabel: 'funder_name', x: '415', y: '95' },
  { tabLabel: 'estimated_annual_percentage_rate', x: '178', y: '280' },
  { tabLabel: 'avarage_monthly_income', x: '331', y: '360' },
  { tabLabel: 'disclosure_merchant_name', x: '420', y: '344' },
  { tabLabel: 'funder_name', x: '432', y: '418' },
  { tabLabel: 'finance_charge', x: '183', y: '465' },
  { tabLabel: 'payment_total', x: '183', y: '487' },
  {
    tabLabel: 'disclosure_page1_line_1',
    x: '439',
    y: '212',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'estimated_payment', x: '182', y: '520' },
  { tabLabel: 'funder_name', x: '173', y: '538' },
  { tabLabel: 'payement_exceeded_percent', x: '426', y: '602' },
  { tabLabel: 'client_name', x: '182', y: '619' },
  { tabLabel: 'monthly_income', x: '364', y: '631' },
  { tabLabel: 'payement_exceeded_percent', x: '402', y: '661' },
  { tabLabel: 'estimated_term', x: '198', y: '69', pageNumber: '2' },
  { tabLabel: 'disclosure_merchant_name', x: '361', y: '82', pageNumber: '2' },
  { tabLabel: 'avarage_monthly_income', x: '454', y: '110', pageNumber: '2' },
  { tabLabel: 'finance_charge', x: '363', y: '158', pageNumber: '2' },
  { tabLabel: 'estimated_monthly_cost', x: '181', y: '375', pageNumber: '2' },
  { tabLabel: 'funder_name', x: '346', y: '388', pageNumber: '2' },
  { tabLabel: 'disclosure_recipient_funds', x: '446', y: '88', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '446',
    y: '109',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '446',
    y: '142',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'disclosure_page3_subtotal', x: '443', y: '161', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '448', y: '183', pageNumber: '3' },
  { tabLabel: 'disclosure_page3_net', x: '444', y: '204', pageNumber: '3' },
];

/** Louisiana disclosure (La. R.S. 3138.4) — daily + weekly share page 1 amounts and page 2 signatures. */
const LOUISIANA_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'client_name', x: '247', y: '99' },
  { tabLabel: 'client_name', x: '249', y: '150' },
  { tabLabel: 'funder_name', x: '207', y: '185' },
  { tabLabel: 'total_amount_business_fund', x: '427', y: '106' },
  { tabLabel: 'total_amount_of_fund_disbursed', x: '427', y: '150' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '427', y: '188' },
  { tabLabel: 'total_dollar_cost', x: '427', y: '237' },
  { tabLabel: 'estimated_payment_amount', x: '438', y: '313' },
  { tabLabel: 'funder_name', x: '239', y: '348' },
  { tabLabel: 'total_dollar_cost', x: '446', y: '432' },
  { tabLabel: 'client_name', x: '274', y: '466' },
  { tabLabel: 'total_dollar_cost', x: '475', y: '532' },
];

const LOUISIANA_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '93', y: '94', pageNumber: '2' },
    { x: '431', y: '94', pageNumber: '2', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '87', y: '172', pageNumber: '2', tabLabel: 'Signature_date' },
    { x: '427', y: '171', pageNumber: '2', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

/** Texas disclosure — 3-page PDF (page 2 = fees/payoff; page 3 = broker/payoff lines + signatures). */
const TEXAS_DISCLOSURE_PAGE1_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'total_amount_of_fund_disbursed', x: '430', y: '101' },
  { tabLabel: 'total_amount_business_fund', x: '431', y: '138' },
  { tabLabel: 'client_name', x: '271', y: '99' },
  { tabLabel: 'client_name', x: '191', y: '134' },
  { tabLabel: 'funder_name', x: '158', y: '172' },
  { tabLabel: 'total_dollar_cost', x: '431', y: '174' },
  { tabLabel: 'total_amount_tobe_paid_to_provider', x: '431', y: '212' },
  { tabLabel: 'estimated_term', x: '449', y: '247' },
  { tabLabel: 'funder_name', x: '240', y: '299' },
  { tabLabel: 'estimated_payment_amount', x: '401', y: '367' },
  { tabLabel: 'estimated_monthly_cost', x: '427', y: '402' },
];

const TEXAS_DISCLOSURE_PAGE2_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '511', y: '68', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '350', y: '139', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '456', y: '277', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '251', y: '304', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '274', y: '332', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '494', y: '346', pageNumber: '2' },
  { tabLabel: 'deal_id_prefix', x: '290', y: '373', pageNumber: '2' },
  { tabLabel: 'client_name', x: '155', y: '407', pageNumber: '2' },
  { tabLabel: 'client_name', x: '139', y: '496', pageNumber: '2' },
  { tabLabel: 'total_dollar_cost', x: '492', y: '461', pageNumber: '2' },
];

const TEXAS_DISCLOSURE_PAGE3_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  { tabLabel: 'deal_id_prefix', x: '503', y: '197', pageNumber: '3' },
  { tabLabel: 'funder_name', x: '241', y: '257', pageNumber: '3' },
  { tabLabel: 'disclosure_broker_fee', x: '510', y: '257', pageNumber: '3' },
  {
    tabLabel: 'disclosure_page3_line_1',
    x: '323',
    y: '310',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_line_2',
    x: '289',
    y: '337',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  {
    tabLabel: 'disclosure_page3_net',
    x: '489',
    y: '350',
    pageNumber: '3',
    optional: true,
    lockedForSigner: true,
  },
  { tabLabel: 'total_dollar_cost', x: '475', y: '398', pageNumber: '3' },
];

const TEXAS_DISCLOSURE_TEXT_TABS: StateDocumentFieldConfig['textTabs'] = [
  ...TEXAS_DISCLOSURE_PAGE1_TEXT_TABS,
  ...TEXAS_DISCLOSURE_PAGE2_TEXT_TABS,
  ...TEXAS_DISCLOSURE_PAGE3_TEXT_TABS,
];

const TEXAS_DISCLOSURE_SIGN_AND_DATE: Pick<
  StateDocumentFieldConfig,
  'signHere' | 'dateTabs'
> = {
  signHere: [
    { x: '95', y: '515', pageNumber: '3' },
    { x: '431', y: '514', pageNumber: '3', signerParty: 'secondary' },
  ],
  dateTabs: [
    { x: '92', y: '592', pageNumber: '3', tabLabel: 'Signature_date' },
    { x: '429', y: '590', pageNumber: '3', tabLabel: 'Signature_date', signerParty: 'secondary' },
  ],
};

export const STATE_DOCUMENT_CONFIG: Record<string, StateDocumentFieldConfig> = {
  weeklyCalifornia: {
    documentId: '1',
    pageNumber: '1',
    ...CALIFORNIA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: CALIFORNIA_WEEKLY_DISCLOSURE_TEXT_TABS,
  },

  dailyCalifornia: {
    documentId: '1',
    pageNumber: '1',
    ...CALIFORNIA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: CALIFORNIA_DAILY_DISCLOSURE_TEXT_TABS,
  },

  weeklyFlorida: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '101', y: '576' },
      { x: '426', y: '577', signerParty: 'secondary' },
    ],
    dateTabs: [
      { x: '96', y: '652', tabLabel: 'Signature_date' },
      { x: '420', y: '650', tabLabel: 'Signature_date', signerParty: 'secondary' },
    ],
    textTabs: FLORIDA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyFlorida: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '89', y: '548' },
      { x: '425', y: '549', signerParty: 'secondary' },
    ],
    dateTabs: [
      { x: '78', y: '623', tabLabel: 'Signature_date' },
      { x: '420', y: '622', tabLabel: 'Signature_date', signerParty: 'secondary' },
    ],
    textTabs: FLORIDA_DAILY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyMissouri: {
    documentId: '1',
    pageNumber: '1',
    ...MISSOURI_DISCLOSURE_SIGN_AND_DATE,
    textTabs: MISSOURI_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyMissouri: {
    documentId: '1',
    pageNumber: '1',
    ...MISSOURI_DISCLOSURE_SIGN_AND_DATE,
    textTabs: MISSOURI_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyGeorgia: {
    documentId: '1',
    pageNumber: '1',
    ...GEORGIA_WEEKLY_DISCLOSURE_SIGN_AND_DATE,
    textTabs: GEORGIA_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyGeorgia: {
    documentId: '1',
    pageNumber: '1',
    ...GEORGIA_DAILY_DISCLOSURE_SIGN_AND_DATE,
    textTabs: GEORGIA_DAILY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyKansas: {
    documentId: '1',
    pageNumber: '1',
    ...KANSAS_WEEKLY_DISCLOSURE_SIGN_AND_DATE,
    textTabs: KANSAS_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyKansas: {
    documentId: '1',
    pageNumber: '1',
    ...KANSAS_DAILY_DISCLOSURE_SIGN_AND_DATE,
    textTabs: KANSAS_DAILY_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  /** Utah disclosure page-1 coordinates (aligned to Utah Code 7-27-202 table). */
  dailyUtah: {
    documentId: '1',
    pageNumber: '1',
    ...UTAH_DISCLOSURE_PAGE2_SIGN_AND_DATE,
    textTabs: UTAH_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyUtah: {
    documentId: '1',
    pageNumber: '1',
    ...UTAH_DISCLOSURE_PAGE2_SIGN_AND_DATE,
    textTabs: UTAH_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyVirginia: {
    documentId: '1',
    pageNumber: '1',
    ...VIRGINIA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: [
      ...VIRGINIA_DISCLOSURE_PAGE1_TEXT_TABS,
      ...VIRGINIA_WEEKLY_PAGE2_TEXT_TABS,
    ],
  },

  dailyVirginia: {
    documentId: '1',
    pageNumber: '1',
    ...VIRGINIA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: [
      ...VIRGINIA_DISCLOSURE_PAGE1_TEXT_TABS,
      ...VIRGINIA_DAILY_PAGE2_TEXT_TABS,
    ],
  },

  weeklyConnecticut: {
    documentId: '1',
    pageNumber: '1',
    ...CONNECTICUT_DISCLOSURE_SIGN_INITIAL_AND_DATES,
    textTabs: [
      ...CONNECTICUT_WEEKLY_DISCLOSURE_PAGE1_TEXT_TABS,
      ...CONNECTICUT_PAGE2_TEXT_TABS,
    ],
  },

  dailyConnecticut: {
    documentId: '1',
    pageNumber: '1',
    ...CONNECTICUT_DISCLOSURE_SIGN_INITIAL_AND_DATES,
    textTabs: [
      ...CONNECTICUT_DAILY_DISCLOSURE_PAGE1_TEXT_TABS,
      ...CONNECTICUT_PAGE2_TEXT_TABS,
    ],
  },

  weeklyNewYork: {
    documentId: '1',
    pageNumber: '1',
    ...NEW_YORK_DISCLOSURE_SIGN_AND_DATE,
    textTabs: NEW_YORK_DISCLOSURE_TEXT_TABS,
  },

  dailyNewYork: {
    documentId: '1',
    pageNumber: '1',
    ...NEW_YORK_DISCLOSURE_SIGN_AND_DATE,
    textTabs: NEW_YORK_DISCLOSURE_TEXT_TABS,
  },

  /** Louisiana (La. R.S. 3138.4) — daily + weekly. */
  weeklyLouisiana: {
    documentId: '1',
    pageNumber: '1',
    ...LOUISIANA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: LOUISIANA_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  dailyLouisiana: {
    documentId: '1',
    pageNumber: '1',
    ...LOUISIANA_DISCLOSURE_SIGN_AND_DATE,
    textTabs: LOUISIANA_DISCLOSURE_PAGE1_TEXT_TABS,
  },

  weeklyTexas: {
    documentId: '1',
    pageNumber: '1',
    ...TEXAS_DISCLOSURE_SIGN_AND_DATE,
    textTabs: TEXAS_DISCLOSURE_TEXT_TABS,
  },

  dailyTexas: {
    documentId: '1',
    pageNumber: '1',
    ...TEXAS_DISCLOSURE_SIGN_AND_DATE,
    textTabs: TEXAS_DISCLOSURE_TEXT_TABS,
  },
};

const STATE_NAME_ALIASES: Record<string, string> = {
  ca: 'california',
  california: 'california',
  fl: 'florida',
  florida: 'florida',
  mo: 'missouri',
  missouri: 'missouri',
  ga: 'georgia',
  georgia: 'georgia',
  ks: 'kansas',
  kansas: 'kansas',
  ut: 'utah',
  utah: 'utah',
  va: 'virginia',
  virginia: 'virginia',
  ct: 'connecticut',
  connecticut: 'connecticut',
  ny: 'newyork',
  newyork: 'newyork',
  'new york': 'newyork',
  la: 'louisiana',
  louisiana: 'louisiana',
  tx: 'texas',
  texas: 'texas',
};

const STATE_DISPLAY_NAME: Record<string, string> = {
  california: 'California',
  florida: 'Florida',
  missouri: 'Missouri',
  georgia: 'Georgia',
  kansas: 'Kansas',
  utah: 'Utah',
  virginia: 'Virginia',
  connecticut: 'Connecticut',
  newyork: 'NewYork',
  louisiana: 'Louisiana',
  texas: 'Texas',
};

function capitalize(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** Resolve config key from CRM `frequency` + `state` (e.g. daily + florida → dailyFlorida). */
export function resolveStateDocumentConfigKey(
  frequency: string | null | undefined,
  state: string | null | undefined,
): string | null {
  const freqRaw = String(frequency ?? '')
    .trim()
    .toLowerCase();
  const stateRaw = String(state ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
  if (!freqRaw || !stateRaw) return null;

  const stateKey = STATE_NAME_ALIASES[stateRaw] || stateRaw.replace(/\s+/g, '');
  const freqKey = freqRaw.startsWith('week') ? 'weekly' : freqRaw.startsWith('day') ? 'daily' : freqRaw;
  const stateName = STATE_DISPLAY_NAME[stateKey] || capitalize(stateKey);
  const key = `${freqKey}${stateName}`;
  return STATE_DOCUMENT_CONFIG[key] ? key : null;
}

export function getStateDocumentConfig(
  frequency: string | null | undefined,
  state: string | null | undefined,
): StateDocumentFieldConfig | null {
  const key = resolveStateDocumentConfigKey(frequency, state);
  return key ? STATE_DOCUMENT_CONFIG[key] : null;
}
