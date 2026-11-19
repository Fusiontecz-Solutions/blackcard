import { createHtmlTemplatePreview } from "./HtmlTemplatePreview";
import { renderPayoffWireInstructionsHtml } from "./payoffWireInstructionsEmailHtml";

export { PAYOFF_WIRE_INSTRUCTIONS_VARIABLES } from "./payoffWireInstructionsShared";

const PayoffWireInstructions = createHtmlTemplatePreview(
  renderPayoffWireInstructionsHtml,
  "Payoff wire instructions preview",
);

export default PayoffWireInstructions;
