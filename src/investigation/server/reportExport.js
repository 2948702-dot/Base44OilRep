/**
 * Выгрузка итогового отчёта в DOCX (§40 ТЗ).
 *
 * Формат выбран не по привычке. PDF потребовал бы встраивать шрифт с кириллицей —
 * это мегабайты в репозитории и отдельный источник ошибок начертания. DOCX — это ZIP
 * с XML внутри: он собирается стандартной библиотекой Node, открывается в Word,
 * LibreOffice и «Google Документах», текст остаётся текстом (его можно искать и
 * цитировать), а печать в PDF доступна в любом из них.
 *
 * Документ повторяет структуру §40 и ничего к ней не добавляет. Каждое утверждение
 * несёт коды выводов и материалов, на которые оно опирается: отчёт, выпущенный за
 * пределы системы, обязан оставаться проверяемым и там, где системы уже нет.
 */

import { buildZip } from './zip.js';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraph(text, { style, bold, italic } = {}) {
  const runProps = [
    bold ? '<w:b/>' : '',
    italic ? '<w:i/>' : '',
  ].join('');
  const properties = `<w:pStyle w:val="${style ?? 'Normal'}"/>`;

  // Пустой абзац остаётся пустым: Word не терпит run без текста в некоторых версиях.
  const runs = String(text ?? '').split('\n').map((line, index) => (
    `${index > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`
  )).join('');

  return `<w:p><w:pPr>${properties}</w:pPr>`
    + `<w:r><w:rPr>${runProps}</w:rPr>${runs}</w:r></w:p>`;
}

function heading(text, level = 1) {
  return paragraph(text, { style: `Heading${level}` });
}

function bullet(text) {
  return paragraph(`• ${text}`);
}

/** Приписка со ссылками, по которым утверждение можно проверить в системе. */
function refs(codes, label) {
  const list = (codes ?? []).filter(Boolean);
  if (list.length === 0) return null;
  return `${label}: ${list.join(', ')}`;
}

const CONFIDENCE_RU = {
  very_low: 'очень низкая', low: 'низкая', moderate: 'средняя',
  high: 'высокая', very_high: 'очень высокая',
};

/**
 * Собирает документ отчёта.
 *
 * @param {Object} params
 * @param {Object} params.report запись InvestigationReport
 * @param {Object} params.investigationCase
 * @returns {Buffer}
 */
export function buildReportDocx({ report, investigationCase }) {
  const s = report.sections ?? {};
  const body = [];

  body.push(heading(report.title ?? 'Отчёт расследования', 1));
  body.push(paragraph(
    `${investigationCase?.case_number ?? ''} · версия ${report.version ?? 1}`
    + ` · статус: ${report.status ?? 'draft'}`,
    { italic: true },
  ));

  if (investigationCase?.is_training) {
    body.push(paragraph(
      'УЧЕБНОЕ ДЕЛО СИМУЛЯТОРА. Документ не является результатом расследования '
      + 'и не может использоваться как таковой.',
      { bold: true },
    ));
  }

  if (report.status !== 'released') {
    body.push(paragraph(
      'Черновик. Отчёт не выпущен: приведённые выводы ещё не прошли выпуск '
      + 'и могут измениться.',
      { bold: true },
    ));
  }

  const section = (title, lines) => {
    body.push(heading(title, 2));
    if (!lines || lines.length === 0) {
      body.push(paragraph('Раздел пуст.', { italic: true }));
      return;
    }
    for (const line of lines) body.push(line);
  };

  section('Резюме', (s.executive_summary ?? []).flatMap((item) => [
    paragraph(item.text),
    refs(item.finding_codes, 'основание') ? paragraph(refs(item.finding_codes, 'основание'), { italic: true }) : null,
  ].filter(Boolean)));

  section('Предмет и границы', [paragraph(s.scope)]);
  section('Методика', [paragraph(s.methodology)]);
  section('Инцидент', [paragraph(s.incident)]);

  section('Участники', (s.persons ?? []).map((p) => bullet(
    `${p.name} — ${p.role}. Отношение к событиям: ${p.relationship_to_incident}`,
  )));

  section('Хронология', (s.timeline ?? []).map((t) => bullet(
    `${t.when} — ${t.what} (уверенность: ${CONFIDENCE_RU[t.confidence] ?? t.confidence}`
    + `${(t.event_codes ?? []).length > 0 ? `; ${t.event_codes.join(', ')}` : ''})`,
  )));

  section('Установленные факты', (s.established_facts ?? []).flatMap((item) => [
    bullet(item.text),
    refs(item.finding_codes, 'основание') ? paragraph(refs(item.finding_codes, 'основание'), { italic: true }) : null,
  ].filter(Boolean)));

  // Заявления и факты разведены намеренно: заявление — это то, что сказал человек,
  // и оно не становится фактом от того, что попало в отчёт.
  section('Заявления участников', (s.claims ?? []).map((item) => bullet(
    `${item.said_by}: «${item.text}». Подтверждённость: ${item.corroboration}`
    + `${(item.claim_codes ?? []).length > 0 ? ` (${item.claim_codes.join(', ')})` : ''}`,
  )));

  section('Противоречия', (s.contradictions ?? []).map((item) => bullet(
    `${item.text} — состояние: ${item.resolution_status}`
    + `${(item.contradiction_codes ?? []).length > 0 ? ` (${item.contradiction_codes.join(', ')})` : ''}`,
  )));

  section('Разбор версий', (s.hypothesis_analysis ?? []).flatMap((item) => [
    bullet(`${item.hypothesis_code} — ${item.description} (${item.status})`),
    paragraph(item.summary),
  ]));

  section('Неразрешённые вопросы', (s.unresolved_questions ?? []).map(bullet));

  section('Рекомендованные действия', (s.recommended_actions ?? []).map((item) => bullet(
    `${item.action} — ${item.reason} (приоритет: ${item.priority})`,
  )));

  section('Приложения', (s.appendices ?? []).flatMap((item) => [
    paragraph(item.title, { bold: true }),
    paragraph(item.content),
  ]));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
<w:sz w:val="24"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>
<w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
<w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
<w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`;

  const encoder = new TextEncoder();
  return buildZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypes) },
    { name: '_rels/.rels', data: encoder.encode(rels) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(documentRels) },
    { name: 'word/styles.xml', data: encoder.encode(styles) },
  ]);
}

/** Имя файла выгрузки: номер дела и версия, без имён участников. */
export function reportFileName(investigationCase, report) {
  const number = (investigationCase?.case_number ?? 'CASE').replace(/[^\w.-]/g, '-');
  return `${number}-otchet-v${report.version ?? 1}.docx`;
}
