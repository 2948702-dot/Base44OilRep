import { jsPDF } from 'jspdf';
import { findFreshOilBaseline } from '@/utils/oilBaselines';

const STATUS_LABEL = { green: 'ХОРОШЕЕ', yellow: 'ВНИМАНИЕ', red: 'КРИТИЧЕСКОЕ' };
const STATUS_RGB = { green: [22, 163, 74], yellow: [202, 138, 4], red: [220, 38, 38] };

function drawHeader(doc, title, subtitle) {
  // Header bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 22, 'F');

  // Company name
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('OilAnalytics', 10, 14);

  // Logo placeholder circle
  doc.setFillColor(59, 130, 246);
  doc.circle(196, 11, 7, 'F');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text('OA', 192.5, 13);

  // Title
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 10, 34);

  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 10, 41);
  }

  return 50;
}

function drawOHIBadge(doc, ohi, status, x, y) {
  const rgb = STATUS_RGB[status] || [100, 116, 139];
  doc.setFillColor(...rgb);
  doc.roundedRect(x, y, 55, 18, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(String(ohi ?? '—'), x + 8, y + 13);
  doc.setFontSize(8);
  doc.text(STATUS_LABEL[status] || '', x + 28, y + 8);
  doc.setFontSize(7);
  doc.text('OHI', x + 28, y + 15);
}

function drawSection(doc, title, y) {
  doc.setFillColor(241, 245, 249);
  doc.rect(10, y, 190, 7, 'F');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text(title, 13, y + 5);
  return y + 10;
}

function drawKV(doc, label, value, x, y, w = 85) {
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(label, x, y);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(String(value ?? '—'), x, y + 5);
  return y + 11;
}

function drawMeasurements(doc, r, y) {
  const params = [
    ['Железо (Fe), мг/л', r.iron_mg_l],
    ['Вода раств., ppm', r.water_ppm],
    ['Активность воды (aw)', r.water_activity],
    ['Вязкость при 40°C, мм²/с', r.viscosity_40],
    ['Плотность, кг/м³', r.density],
    ['Диэлектр. постоянная', r.dielectric_constant],
  ];

  const col1 = params.slice(0, 4);
  const col2 = params.slice(4);

  col1.forEach((p, i) => drawKV(doc, p[0], p[1], 10, y + i * 11));
  col2.forEach((p, i) => drawKV(doc, p[0], p[1], 105, y + i * 11));

  return y + Math.max(col1.length, col2.length) * 11 + 2;
}

function drawIndices(doc, r, y) {
  const indices = [
    { label: 'Индекс воды', value: r.water_index, color: [14, 165, 233] },
    { label: 'Индекс износа', value: r.wear_index, color: [168, 85, 247] },
    { label: 'Индекс вязкости', value: r.viscosity_index_calc, color: [245, 158, 11] },
    { label: 'Индекс диэлектр.', value: r.dielectric_index, color: [16, 185, 129] },
  ];

  const w = 42;
  indices.forEach((idx, i) => {
    const x = 10 + i * (w + 5);
    const rgb = idx.color;
    const pct = (idx.value ?? 0) / 100;

    // Bar background
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(x, y, w, 4, 1, 1, 'F');
    // Bar fill
    doc.setFillColor(...rgb);
    doc.roundedRect(x, y, w * pct, 4, 1, 1, 'F');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb);
    doc.text(String(idx.value ?? '—'), x, y + 11);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(idx.label, x, y + 16);
  });

  return y + 22;
}

function drawRecommendation(doc, text, y) {
  const rgb = STATUS_RGB.yellow;
  doc.setFillColor(254, 249, 195);
  doc.setDrawColor(202, 138, 4);
  doc.roundedRect(10, y, 190, 16, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(133, 77, 14);
  doc.text('Рекомендация:', 14, y + 6);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text || '—', 176);
  doc.text(lines[0], 14, y + 12);
  return y + 20;
}

function drawFooter(doc, pageNum) {
  const date = new Date().toLocaleDateString('ru-RU');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`Сформировано: ${date}`, 10, 291);
  doc.text(`Страница ${pageNum}`, 170, 291);
  doc.setDrawColor(226, 232, 240);
  doc.line(10, 286, 200, 286);
}

// ─────────────────────────────────────────────
// Export single sample report
// ─────────────────────────────────────────────
export function exportSamplePDF({ result, sample, oilRef, baseline, client, asset, unit }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let y = drawHeader(doc, 'Отчёт по пробе масла', `Проба: ${sample?.sample_number || '—'} · Дата: ${sample?.sampling_date || '—'}`);

  // OHI badge
  drawOHIBadge(doc, result.oil_health_index, result.overall_status, 145, y - 10);

  // Equipment info
  y = drawSection(doc, 'ИНФОРМАЦИЯ ОБ ОБОРУДОВАНИИ', y);
  drawKV(doc, 'Клиент', client?.company_name, 10, y);
  drawKV(doc, 'Актив', asset?.asset_name, 75, y);
  drawKV(doc, 'Тип актива', asset?.asset_type, 140, y);
  y += 11;
  drawKV(doc, 'Оборудование', unit?.unit_name, 10, y);
  drawKV(doc, 'Масло', oilRef?.oil_name, 75, y);
  y += 14;

  // Sample info
  y = drawSection(doc, 'ДАННЫЕ ПРОБЫ', y);
  drawKV(doc, 'Дата отбора', sample?.sampling_date, 10, y);
  drawKV(doc, 'М/ч на момент отбора', sample?.total_hours_at_sampling, 75, y);
  drawKV(doc, 'Часы на масле', sample?.oil_hours_at_sampling, 140, y);
  y += 14;

  if (baseline) {
    y = drawSection(doc, 'БАЗОВЫЙ ЛАБОРАТОРНЫЙ АНАЛИЗ СВЕЖЕГО МАСЛА', y);
    drawKV(doc, 'Вязкость 40°C', baseline.viscosity_40, 10, y);
    drawKV(doc, 'Плотность', baseline.density, 55, y);
    drawKV(doc, 'Диэлектр.', baseline.dielectric_constant, 100, y);
    drawKV(doc, 'Вода ppm', baseline.water_ppm, 145, y);
    y += 14;
  }

  // Measurements
  y = drawSection(doc, 'РЕЗУЛЬТАТЫ ИЗМЕРЕНИЙ', y);
  y = drawMeasurements(doc, result, y);
  y += 3;

  // Indices
  y = drawSection(doc, 'РАСЧЁТНЫЕ ИНДЕКСЫ', y);
  y = drawIndices(doc, result, y);
  y += 5;

  // OHI summary
  y = drawSection(doc, 'ИТОГОВАЯ ОЦЕНКА', y);
  const rgb = STATUS_RGB[result.overall_status] || [100, 116, 139];
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...rgb);
  doc.text(`OHI: ${result.oil_health_index ?? '—'} / 100 — ${STATUS_LABEL[result.overall_status] || '—'}`, 10, y);
  y += 10;

  // Recommendation
  y = drawRecommendation(doc, result.recommendation_text, y);

  drawFooter(doc, 1);
  doc.save(`report_${sample?.sample_number || 'sample'}.pdf`);
}

// ─────────────────────────────────────────────
// Export full equipment report (multiple results)
// ─────────────────────────────────────────────
export function exportEquipmentReportPDF({ results, samples, oilRefs, clients, assets, units }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let pageNum = 1;

  // Cover page
  let y = drawHeader(doc, 'Полный отчёт по состоянию агрегатов', `Дата формирования: ${new Date().toLocaleDateString('ru-RU')} · Проб: ${results.length}`);

  // Summary table
  y = drawSection(doc, 'СВОДНАЯ ТАБЛИЦА РЕЗУЛЬТАТОВ', y);

  // Table header
  doc.setFillColor(30, 41, 59);
  doc.rect(10, y, 190, 7, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  const cols = [10, 40, 80, 110, 125, 140, 155, 172];
  const headers = ['Проба', 'Оборудование', 'Масло', 'Fe мг/л', 'H₂O ppm', 'Вязк.40', 'OHI', 'Статус'];
  headers.forEach((h, i) => doc.text(h, cols[i], y + 5));
  y += 9;

  results.forEach((r, idx) => {
    if (y > 270) {
      drawFooter(doc, pageNum);
      doc.addPage();
      pageNum++;
      y = 15;
    }

    const s = samples.find(s => s.id === r.sample_id);
    const unit = units.find(u => u.id === s?.equipment_unit_id);
    const oil = oilRefs.find(o => o.id === (s?.oil_type_id || unit?.current_oil_type_id || unit?.oil_type_id));
    const rgb = STATUS_RGB[r.overall_status] || [100, 116, 139];

    if (idx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(10, y - 1, 190, 7, 'F'); }

    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(s?.sample_number || '—', cols[0], y + 4);
    doc.text((unit?.unit_name || '—').slice(0, 20), cols[1], y + 4);
    doc.text((oil?.oil_name || '—').slice(0, 18), cols[2], y + 4);
    doc.text(String(r.iron_mg_l ?? '—'), cols[3], y + 4);
    doc.text(String(r.water_ppm ?? '—'), cols[4], y + 4);
    doc.text(String(r.viscosity_40 ?? '—'), cols[5], y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...rgb);
    doc.text(String(r.oil_health_index ?? '—'), cols[6], y + 4);

    doc.setFillColor(...rgb);
    doc.roundedRect(cols[7], y, 28, 6, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.text(STATUS_LABEL[r.overall_status] || '—', cols[7] + 2, y + 4);

    y += 8;
  });

  y += 8;

  // Per-result detail pages
  results.forEach((r) => {
    const s = samples.find(s => s.id === r.sample_id);
    if (!s) return;

    drawFooter(doc, pageNum);
    doc.addPage();
    pageNum++;

    const client = clients.find(c => c.id === s.client_id);
    const asset = assets.find(a => a.id === s.asset_id);
    const unit = units.find(u => u.id === s.equipment_unit_id);
    const oilRef = oilRefs.find(o => o.id === (s.oil_type_id || unit?.current_oil_type_id || unit?.oil_type_id));
    const baseline = findFreshOilBaseline(s, samples, results, units);

    let py = drawHeader(doc, `Проба ${s.sample_number}`, `${asset?.asset_name || ''} · ${unit?.unit_name || ''} · ${s.sampling_date || ''}`);

    drawOHIBadge(doc, r.oil_health_index, r.overall_status, 145, py - 10);

    py = drawSection(doc, 'ОБОРУДОВАНИЕ', py);
    drawKV(doc, 'Клиент', client?.company_name, 10, py);
    drawKV(doc, 'Актив', asset?.asset_name, 75, py);
    drawKV(doc, 'Оборудование', unit?.unit_name, 140, py);
    py += 14;

    py = drawSection(doc, 'РЕЗУЛЬТАТЫ ИЗМЕРЕНИЙ', py);
    py = drawMeasurements(doc, r, py);
    py += 3;

    if (baseline?.result) {
      py = drawSection(doc, 'БАЗОВЫЙ АНАЛИЗ СВЕЖЕГО МАСЛА', py);
      drawKV(doc, 'Проба', baseline.sample.sample_number, 10, py);
      drawKV(doc, 'Вязкость 40°C', baseline.result.viscosity_40, 55, py);
      drawKV(doc, 'Диэлектр.', baseline.result.dielectric_constant, 110, py);
      drawKV(doc, 'Плотность', baseline.result.density, 155, py);
      py += 14;
    }

    py = drawSection(doc, 'ИНДЕКСЫ', py);
    py = drawIndices(doc, r, py);
    py += 5;

    py = drawRecommendation(doc, r.recommendation_text, py);
  });

  drawFooter(doc, pageNum);
  doc.save(`equipment_report_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ─────────────────────────────────────────────
// Print compare dashboard
// ─────────────────────────────────────────────
export function exportToPdf(_element, _enriched) {
  void _element;
  void _enriched;
  window.print();
}
