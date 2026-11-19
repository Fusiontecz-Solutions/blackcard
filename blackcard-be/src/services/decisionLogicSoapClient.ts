/**
 * Decision Logic Integration-v2.asmx (SOAP 1.1) — CreateAndVerifyRequest2
 * mirrors the JSON body used by REST CreateAndVerifyRequest.
 */

export type DecisionLogicCreateVerifySoapPayload = {
  serviceKey: string;
  siteUserGuid: string;
  profileGuid: string;
  customerId: string;
  firstName: string;
  lastName: string;
  accountNumber: string;
  routingNumber: string;
  contentServiceId: number;
  emailAddress: string;
  matchType: number;
  matchConsumerReferenceId: string;
  matchFirstName: string;
  matchMiddleName: string;
  matchLastName: string;
  matchSuffix: string;
  matchAddressStreet: string;
  matchAddressCity: string;
  matchAddressState: string;
  matchAddressZip: string;
  matchPhoneNumber: string;
  matchSocialSecurityNumber: string;
  matchEmailAddress: string;
  matchDobDay: number;
  matchDobMonth: number;
  matchDobYear: number;
  matchDriversLicenseState: string;
  matchDriversLicenseNumber: string;
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstMatch(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)</${tag}>`,
    "i",
  );
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function decisionLogicSoapEndpoint(): string {
  const raw =
    process.env.DECISION_LOGIC_SOAP_ENDPOINT?.trim() ||
    "https://integration.decisionlogic.com/Integration-v2.asmx";
  return raw.replace(/\/$/, "");
}

function soapNamespace(): string {
  return (
    process.env.DECISION_LOGIC_SOAP_NAMESPACE?.trim() ||
    "https://integration.decisionlogic.com"
  );
}

export async function createAndVerifyRequestSoap2(
  payload: DecisionLogicCreateVerifySoapPayload,
): Promise<{ requestCode: string; isError: boolean; errorMessage: string }> {
  const ns = soapNamespace();
  const endpoint = decisionLogicSoapEndpoint();
  const tags: [string, string | number][] = [
    ["serviceKey", payload.serviceKey],
    ["siteUserGuid", payload.siteUserGuid],
    ["profileGuid", payload.profileGuid],
    ["customerId", payload.customerId],
    ["firstName", payload.firstName],
    ["lastName", payload.lastName],
    ["accountNumber", payload.accountNumber],
    ["routingNumber", payload.routingNumber],
    ["contentServiceId", payload.contentServiceId],
    ["emailAddress", payload.emailAddress],
    ["matchType", payload.matchType],
    ["matchConsumerReferenceId", payload.matchConsumerReferenceId],
    ["matchFirstName", payload.matchFirstName],
    ["matchMiddleName", payload.matchMiddleName],
    ["matchLastName", payload.matchLastName],
    ["matchSuffix", payload.matchSuffix],
    ["matchAddressStreet", payload.matchAddressStreet],
    ["matchAddressCity", payload.matchAddressCity],
    ["matchAddressState", payload.matchAddressState],
    ["matchAddressZip", payload.matchAddressZip],
    ["matchPhoneNumber", payload.matchPhoneNumber],
    [
      "matchSocialSecurityNumber",
      payload.matchSocialSecurityNumber,
    ],
    ["matchEmailAddress", payload.matchEmailAddress],
    ["matchDobDay", payload.matchDobDay],
    ["matchDobMonth", payload.matchDobMonth],
    ["matchDobYear", payload.matchDobYear],
    [
      "matchDriversLicenseState",
      payload.matchDriversLicenseState,
    ],
    [
      "matchDriversLicenseNumber",
      payload.matchDriversLicenseNumber,
    ],
  ];

  const inner = tags
    .map(([tag, val]) => {
      const innerVal =
        typeof val === "number" && Number.isFinite(val)
          ? String(Math.trunc(val))
          : xmlEscape(String(val ?? ""));
      return `<${tag}>${innerVal}</${tag}>`;
    })
    .join("");

  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateAndVerifyRequest2 xmlns="${ns}">
      ${inner}
    </CreateAndVerifyRequest2>
  </soap:Body>
</soap:Envelope>`;

  const soapAction = `"${ns}/CreateAndVerifyRequest2"`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: soapAction,
    },
    body: envelope,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Decision Logic SOAP HTTP ${response.status}: ${text.slice(0, 500)}`,
    );
  }

  const requestCode = firstMatch(text, "RequestCode");
  const isErrRaw = firstMatch(text, "IsError").toLowerCase();
  const isError = isErrRaw === "true";
  const rawErr = firstMatch(text, "ErrorMessage");
  const errorMessage = rawErr
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  return { requestCode, isError, errorMessage };
}
