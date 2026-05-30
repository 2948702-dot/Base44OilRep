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
    
    const updates = [];
    for (let i = 0; i < Math.min(allUnits.length, 30); i++) {
      updates.push({
        id: allUnits[i].id,
        name: UNIT_NAMES[i % UNIT_NAMES.length]
      });
    }

    let updated = 0;
    for (const upd of updates) {
      try {
        await base44.asServiceRole.entities.EquipmentUnit.update(upd.id, { unit_name: upd.name });
        updated++;
      } catch (e) {
        console.error(`Failed to update ${upd.id}:`, e.message);
      }
    }

    return Response.json({ success: true, updated, total: allUnits.length, processed: updates.length });
  } catch (error) {
    console.error('Update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});