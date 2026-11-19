import type { DocumentLayout, DocumentLayoutPlacement } from './convert-docusign-template-export';
import {
  getStateDocumentConfig,
  resolveStateDocumentConfigKey,
  type StateDocumentFieldConfig,
} from '../state-document-config';

function textPlacements(
  config: StateDocumentFieldConfig,
  startId: number,
): { placements: DocumentLayoutPlacement[]; nextId: number } {
  const placements: DocumentLayoutPlacement[] = [];
  let id = startId;
  for (const tab of config.textTabs) {
    const variable = tab.tabLabel;
    placements.push({
      id: `sd_text_${id}`,
      type: 'text',
      variable,
      sourceTabLabel: `${variable}_${id}`,
      documentId: config.documentId,
      pageNumber: tab.pageNumber || config.pageNumber,
      x: tab.x,
      y: tab.y,
      /** Omitted → envelope builder sizes tab width to the prefilled value. */
      width: tab.width && tab.width !== 'auto' ? tab.width : undefined,
      height: tab.height || '18',
      optional: tab.optional === true,
      lockedForSigner: tab.lockedForSigner === true,
      signerParty: 'primary',
    });
    id += 1;
  }
  return { placements, nextId: id };
}

function datePlacements(
  config: StateDocumentFieldConfig,
  startId: number,
): { placements: DocumentLayoutPlacement[]; nextId: number } {
  const placements: DocumentLayoutPlacement[] = [];
  let id = startId;
  for (const tab of config.dateTabs) {
    const variable = String(tab.tabLabel || 'signature_date').trim() || 'signature_date';
    placements.push({
      id: `sd_date_${id}`,
      type: 'date',
      variable,
      documentId: config.documentId,
      pageNumber: tab.pageNumber || config.pageNumber,
      x: tab.x,
      y: tab.y,
      height: '18',
      signerParty: tab.signerParty === 'secondary' ? 'secondary' : 'primary',
    });
    id += 1;
  }
  return { placements, nextId: id };
}

function signaturePlacements(
  config: StateDocumentFieldConfig,
  startId: number,
): { placements: DocumentLayoutPlacement[]; nextId: number } {
  const placements: DocumentLayoutPlacement[] = [];
  let id = startId;
  for (const tab of config.signHere) {
    placements.push({
      id: `sd_sign_${id}`,
      type: 'signature',
      slot: `signature_${tab.x}_${tab.y}`,
      documentId: config.documentId,
      pageNumber: tab.pageNumber || config.pageNumber,
      x: tab.x,
      y: tab.y,
      width: '200',
      height: '40',
      signerParty: tab.signerParty === 'secondary' ? 'secondary' : 'primary',
    });
    id += 1;
  }
  return { placements, nextId: id };
}

function initialPlacements(
  config: StateDocumentFieldConfig,
  startId: number,
): { placements: DocumentLayoutPlacement[]; nextId: number } {
  const placements: DocumentLayoutPlacement[] = [];
  let id = startId;
  for (const tab of config.initialHereTabs || []) {
    placements.push({
      id: `sd_initial_${id}`,
      type: 'initial',
      slot: `initial_${tab.x}_${tab.y}`,
      documentId: config.documentId,
      pageNumber: tab.pageNumber || config.pageNumber,
      x: tab.x,
      y: tab.y,
      width: '80',
      height: '24',
      signerParty: 'primary',
    });
    id += 1;
  }
  return { placements, nextId: id };
}

/** Build a platform `DocumentLayout` from coordinate config + CRM state/frequency. */
export function buildDocumentLayoutFromStateDocumentConfig(options: {
  configKey: string;
  config: StateDocumentFieldConfig;
  name: string;
  fileName?: string;
}): DocumentLayout {
  const { config, configKey, name, fileName } = options;
  let id = 1;
  const chunks: DocumentLayoutPlacement[] = [];

  const text = textPlacements(config, id);
  chunks.push(...text.placements);
  id = text.nextId;

  const dates = datePlacements(config, id);
  chunks.push(...dates.placements);
  id = dates.nextId;

  const signs = signaturePlacements(config, id);
  chunks.push(...signs.placements);
  id = signs.nextId;

  const initials = initialPlacements(config, id);
  chunks.push(...initials.placements);

  const variables = [
    ...new Set(
      chunks
        .map((p) => String(p.variable || '').trim())
        .filter(Boolean),
    ),
  ];

  return {
    layoutVersion: 1,
    key: `state_disclosure_${configKey}`,
    name,
    description: 'Generated from state-document-config.ts coordinates',
    document: {
      documentId: config.documentId,
      originalFileName: fileName || `${name}.pdf`,
    },
    signers: [{ roleName: 'Client', routingOrder: 1 }],
    variables,
    placements: chunks,
  };
}

export function tryBuildStateDisclosureLayoutFromDbRow(row: {
  name?: string | null;
  state?: string | null;
  frequency?: string | null;
  type?: string | null;
  pdfUrl?: string | null;
}): DocumentLayout | null {
  const type = String(row.type || '').trim().toLowerCase();
  if (type && type !== 'disclosure') return null;

  const config = getStateDocumentConfig(row.frequency, row.state);
  if (!config) return null;

  const configKey =
    resolveStateDocumentConfigKey(row.frequency, row.state) || 'disclosure';

  const fileName = String(row.pdfUrl || '')
    .split('/')
    .pop()
    ?.split('?')[0];

  return buildDocumentLayoutFromStateDocumentConfig({
    configKey,
    config,
    name: String(row.name || 'State disclosure').trim() || 'State disclosure',
    fileName: fileName || undefined,
  });
}
