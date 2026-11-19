/**
 * @deprecated Import from `./paymentTemplateApi` instead.
 * Kept for backward compatibility — Letters loads templates from the API.
 */
export {
    TEMPLATE_CATEGORY_LABELS,
    getPaymentTemplates,
    readPaymentTemplatesCache,
    type TemplateCategory,
    type TemplateItem,
} from "./paymentTemplateApi";

/** @deprecated Empty — use getPaymentTemplates() for live templates. */
export const PAYMENT_TEMPLATE_CATALOG: import("./paymentTemplateApi").TemplateItem[] = [];
