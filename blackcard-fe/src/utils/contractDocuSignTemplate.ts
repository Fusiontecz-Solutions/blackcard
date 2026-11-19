import { DEFAULT_DOCUSIGN_TEMPLATE_ID } from "@/components/application/contractdata/docusignTemplateConfig";
import { normalizeLegacyFunderName } from "@/constants/contractFunder";

/**
 * Resolve the DocuSign template id for a contract funder.
 * Woodmere currently uses one default template for all funders.
 */
export async function fetchDocuSignTemplateIdForFunder(
    funderName?: string | null,
): Promise<string> {
    void normalizeLegacyFunderName(funderName);
    return DEFAULT_DOCUSIGN_TEMPLATE_ID;
}
