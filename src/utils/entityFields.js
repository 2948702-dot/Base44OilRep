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

export const OIL_REFERENCE_FIELDS = [
  'oil_name',
  'manufacturer',
  'oil_category',
  'iso_vg_grade',
  'sae_grade',
  'passport_viscosity_40',
  'passport_density_15',
  'passport_dielectric',
  'comments',
];
export const OIL_REFERENCE_NUMBER_FIELDS = [
  'passport_viscosity_40',
  'passport_density_15',
  'passport_dielectric',
];

export const SAMPLING_POINT_FIELDS = [
  'client_id',
  'asset_id',
  'equipment_unit_id',
  'point_name',
  'qr_code',
  'sampling_method',
  'comments',
];
export const SAMPLING_POINT_NUMBER_FIELDS = [];

export const SAMPLING_SCHEDULE_FIELDS = [
  'sampling_point_id',
  'schedule_name',
  'is_active',
  'stages',
  'next_sample_due_date',
  'next_sample_due_hours',
  'current_stage',
  'samples_in_current_stage',
  'comments',
];
export const SAMPLING_SCHEDULE_NUMBER_FIELDS = [
  'next_sample_due_hours',
  'current_stage',
  'samples_in_current_stage',
];

export const OIL_SAMPLE_FIELDS = [
  'sample_type',
  'sample_number',
  'sample_origin',
  'container_type',
  'external_sample_label',
  'can_qr_code',
  'client_id',
  'asset_id',
  'equipment_unit_id',
  'sampling_point_id',
  'oil_type_id',
  'lifecycle_id',
  'applies_to_equipment_unit_ids',
  'applies_to_lifecycle_ids',
  'sampling_date',
  'received_date',
  'received_by',
  'hours_source',
  'total_hours_at_sampling',
  'oil_hours_at_sampling',
  'engine_state',
  'sample_status',
  'batch_number',
  'production_date',
  'storage_type',
  'delivery_date',
  'supplier',
  'operator_user_id',
  'comments',
  'attachments',
];
export const OIL_SAMPLE_NUMBER_FIELDS = [
  'total_hours_at_sampling',
  'oil_hours_at_sampling',
];
