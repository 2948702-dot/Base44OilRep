import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const UNIT_NAMES = ['ДВС', 'ГД', 'Редуктор', 'Рулевой привод', 'Вспом. двигатель', 'ГД Левый', 'ГД Правый', 'Генератор', 'Пресс', 'Прочее'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const allUnits = await base44.asServiceRole.entities.EquipmentUnit.list();
    
    let updated = 0;
    for (let i = 0; i < allUnits.length; i++) {
      const unit = allUnits[i];
      const newName = UNIT_NAMES[i % UNIT_NAMES.length];
      await base44.asServiceRole.entities.EquipmentUnit.update(unit.id, { unit_name: newName });
      updated++;
    }

    return Response.json({ success: true, updated, total: allUnits.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});