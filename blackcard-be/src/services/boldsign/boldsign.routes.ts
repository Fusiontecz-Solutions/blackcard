/**
 * Legacy `/boldsign` routes — delegate to DocuSign implementation.
 * Frontend should call `/docusign`; these remain for backward compatibility.
 */
import docusignRoutes from '../docusign/docusign.routes';

export default docusignRoutes;
