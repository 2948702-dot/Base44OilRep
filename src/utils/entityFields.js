/**
 * Whitelist'ы полей для buildPayload, сверенные со схемами base44/entities/*.jsonc.
 *
 * При добавлении нового поля в схему — обязательно добавлять и сюда.
 * Snapshot и системные поля (current_*, last_*_date, id, created_*, updated_*) НЕ включать.
 */

export const CLIENT_FIELDS = [
  'company_name',
  'contact_person',
  'phone',
  'email',
  'address',
  'comments',
];
export const CLIENT_NUMBER_FIELDS = [];

export const ASSET_FIELDS = [
  'client_id',
  'asset_name',
  'asset_type',
  'registration_number',
  'location',
  'comments',
];
export const ASSET_NUMBER_FIELDS = [];

export const EQUIPMENT_UNIT_FIELDS = [
  'client_id',
  'asset_id',
  'unit_name',
  'equipment_type',
  'manufacturer',
  'model',
  'serial_number',
  'total_operating_hours',
  'initial_oil_hours',
  'oil_type_id',
  'oil_brand',
  'oil_volume',
  'oil_change_type',
  'oil_change_interval',
  'oil_change_interval_unit',
  'oil_filter_type',
  'oil_filter_brand',
  'oil_filter_article',
  'use_standard_thresholds',
  'custom_thresholds',
  'comments',
];
export const EQUIPMENT_UNIT_NUMBER_FIELDS = [
  'total_operating_hours',
  'initial_oil_hours',
  'oil_volume',
  'oil_change_interval',
];
